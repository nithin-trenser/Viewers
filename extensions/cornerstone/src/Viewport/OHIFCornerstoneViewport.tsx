import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useResizeDetector } from 'react-resize-detector';
import * as cs3DTools from '@cornerstonejs/tools';
import { Enums, eventTarget, getEnabledElement } from '@cornerstonejs/core';
import { MeasurementService } from '@ohif/core';
import { AllInOneMenu, useViewportDialog } from '@ohif/ui';
import type { Types as csTypes } from '@cornerstonejs/core';

import { setEnabledElement } from '../state';

import './OHIFCornerstoneViewport.css';
import CornerstoneOverlays from './Overlays/CornerstoneOverlays';
import CinePlayer from '../components/CinePlayer';
import type { Types } from '@ohif/core';

import OHIFViewportActionCorners from '../components/OHIFViewportActionCorners';
import { getWindowLevelActionMenu } from '../components/WindowLevelActionMenu/getWindowLevelActionMenu';
import { getViewportDataOverlaySettingsMenu } from '../components/ViewportDataOverlaySettingMenu';
import { getViewportPresentations } from '../utils/presentations/getViewportPresentations';
import { useSynchronizersStore } from '../stores/useSynchronizersStore';
import ActiveViewportBehavior from '../utils/ActiveViewportBehavior';
import { WITH_NAVIGATION } from '../services/ViewportService/CornerstoneViewportService';

const STACK = 'stack';

// Todo: This should be done with expose of internal API similar to react-vtkjs-viewport
// Then we don't need to worry about the re-renders if the props change.
const OHIFCornerstoneViewport = React.memo(
  (
    props: withAppTypes<{
      viewportId: string;
      displaySets: AppTypes.DisplaySet[];
      viewportOptions: AppTypes.ViewportGrid.GridViewportOptions;
      initialImageIndex: number;
    }>
  ) => {
    const {
      displaySets,
      dataSource,
      viewportOptions,
      displaySetOptions,
      servicesManager,
      commandsManager,
      onElementEnabled,
      // eslint-disable-next-line react/prop-types
      onElementDisabled,
      isJumpToMeasurementDisabled = false,
      // Note: you SHOULD NOT use the initialImageIdOrIndex for manipulation
      // of the imageData in the OHIFCornerstoneViewport. This prop is used
      // to set the initial state of the viewport's first image to render
      // eslint-disable-next-line react/prop-types
      initialImageIndex,
      // if the viewport is part of a hanging protocol layout
      // we should not really rely on the old synchronizers and
      // you see below we only rehydrate the synchronizers if the viewport
      // is not part of the hanging protocol layout. HPs should
      // define their own synchronizers. Since the synchronizers are
      // viewportId dependent and
      // eslint-disable-next-line react/prop-types
      isHangingProtocolLayout,
    } = props;
    const viewportId = viewportOptions.viewportId;

    if (!viewportId) {
      throw new Error('Viewport ID is required');
    }

    // Make sure displaySetOptions has one object per displaySet
    while (displaySetOptions.length < displaySets.length) {
      displaySetOptions.push({});
    }

    // Since we only have support for dynamic data in volume viewports, we should
    // handle this case here and set the viewportType to volume if any of the
    // displaySets are dynamic volumes
    viewportOptions.viewportType = displaySets.some(
      ds => ds.isDynamicVolume && ds.isReconstructable
    )
      ? 'volume'
      : viewportOptions.viewportType;

    const [scrollbarHeight, setScrollbarHeight] = useState('100px');
    const [enabledVPElement, setEnabledVPElement] = useState(null);
    const elementRef = useRef() as React.MutableRefObject<HTMLDivElement>;

    const {
      displaySetService,
      toolbarService,
      toolGroupService,
      syncGroupService,
      cornerstoneViewportService,
      segmentationService,
      cornerstoneCacheService,
      viewportActionCornersService,
      customizationService,
      measurementService,
    } = servicesManager.services;

    const [viewportDialogState] = useViewportDialog();
    // useCallback for scroll bar height calculation
    const setImageScrollBarHeight = useCallback(() => {
      const scrollbarHeight = `${elementRef.current.clientHeight - 40}px`;
      setScrollbarHeight(scrollbarHeight);
    }, [elementRef]);

    // useCallback for onResize
    const onResize = useCallback(() => {
      if (elementRef.current) {
        cornerstoneViewportService.resize();
        setImageScrollBarHeight();
      }
    }, [elementRef]);

    const cleanUpServices = useCallback(
      viewportInfo => {
        const renderingEngineId = viewportInfo.getRenderingEngineId();
        const syncGroups = viewportInfo.getSyncGroups();

        toolGroupService.removeViewportFromToolGroup(viewportId, renderingEngineId);
        syncGroupService.removeViewportFromSyncGroup(viewportId, renderingEngineId, syncGroups);

        segmentationService.clearSegmentationRepresentations(viewportId);

        viewportActionCornersService.clear(viewportId);
      },
      [
        viewportId,
        segmentationService,
        syncGroupService,
        toolGroupService,
        viewportActionCornersService,
      ]
    );

    const elementEnabledHandler = useCallback(
      evt => {
        // check this is this element reference and return early if doesn't match
        if (evt.detail.element !== elementRef.current) {
          return;
        }

        const { viewportId, element } = evt.detail;
        const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);

        if (!viewportInfo) {
          return;
        }

        setEnabledElement(viewportId, element);
        setEnabledVPElement(element);

        const renderingEngineId = viewportInfo.getRenderingEngineId();
        const toolGroupId = viewportInfo.getToolGroupId();
        const syncGroups = viewportInfo.getSyncGroups();

        toolGroupService.addViewportToToolGroup(viewportId, renderingEngineId, toolGroupId);

        syncGroupService.addViewportToSyncGroup(viewportId, renderingEngineId, syncGroups);

        // we don't need reactivity here so just use state
        const { synchronizersStore } = useSynchronizersStore.getState();
        if (synchronizersStore?.[viewportId]?.length && !isHangingProtocolLayout) {
          // If the viewport used to have a synchronizer, re apply it again
          _rehydrateSynchronizers(viewportId, syncGroupService);
        }

        if (onElementEnabled && typeof onElementEnabled === 'function') {
          onElementEnabled(evt);
        }
      },
      [viewportId, onElementEnabled, toolGroupService]
    );

    // disable the element upon unmounting
    useEffect(() => {
      cornerstoneViewportService.enableViewport(viewportId, elementRef.current);

      eventTarget.addEventListener(Enums.Events.ELEMENT_ENABLED, elementEnabledHandler);

      setImageScrollBarHeight();

      return () => {
        const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);

        if (!viewportInfo) {
          return;
        }

        cornerstoneViewportService.storePresentation({ viewportId });

        // This should be done after the store presentation since synchronizers
        // will get cleaned up and they need the viewportInfo to be present
        cleanUpServices(viewportInfo);

        if (onElementDisabled && typeof onElementDisabled === 'function') {
          onElementDisabled(viewportInfo);
        }

        cornerstoneViewportService.disableElement(viewportId);

        eventTarget.removeEventListener(Enums.Events.ELEMENT_ENABLED, elementEnabledHandler);
      };
    }, []);

    // subscribe to displaySet metadata invalidation (updates)
    // Currently, if the metadata changes we need to re-render the display set
    // for it to take effect in the viewport. As we deal with scaling in the loading,
    // we need to remove the old volume from the cache, and let the
    // viewport to re-add it which will use the new metadata. Otherwise, the
    // viewport will use the cached volume and the new metadata will not be used.
    // Note: this approach does not actually end of sending network requests
    // and it uses the network cache
    useEffect(() => {
      const { unsubscribe } = displaySetService.subscribe(
        displaySetService.EVENTS.DISPLAY_SET_SERIES_METADATA_INVALIDATED,
        async ({
          displaySetInstanceUID: invalidatedDisplaySetInstanceUID,
          invalidateData,
        }: Types.DisplaySetSeriesMetadataInvalidatedEvent) => {
          if (!invalidateData) {
            return;
          }

          const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);

          if (viewportInfo.hasDisplaySet(invalidatedDisplaySetInstanceUID)) {
            const viewportData = viewportInfo.getViewportData();
            const newViewportData = await cornerstoneCacheService.invalidateViewportData(
              viewportData,
              invalidatedDisplaySetInstanceUID,
              dataSource,
              displaySetService
            );

            const keepCamera = true;
            cornerstoneViewportService.updateViewport(viewportId, newViewportData, keepCamera);
          }
        }
      );
      return () => {
        unsubscribe();
      };
    }, [viewportId]);

    useEffect(() => {
      // handle the default viewportType to be stack
      if (!viewportOptions.viewportType) {
        viewportOptions.viewportType = STACK;
      }

      const loadViewportData = async () => {
        const viewportData = await cornerstoneCacheService.createViewportData(
          displaySets,
          viewportOptions,
          dataSource,
          initialImageIndex
        );

        const presentations = getViewportPresentations(viewportId, viewportOptions);

        // Note: This is a hack to get the grid to re-render the OHIFCornerstoneViewport component
        // Used for segmentation hydration right now, since the logic to decide whether
        // a viewport needs to render a segmentation lives inside the CornerstoneViewportService
        // so we need to re-render (force update via change of the needsRerendering) so that React
        // does the diffing and decides we should render this again (although the id and element has not changed)
        // so that the CornerstoneViewportService can decide whether to render the segmentation or not. Not that we reached here we can turn it off.
        if (viewportOptions.needsRerendering) {
          viewportOptions.needsRerendering = false;
        }

        cornerstoneViewportService.setViewportData(
          viewportId,
          viewportData,
          viewportOptions,
          displaySetOptions,
          presentations
        );
      };

      loadViewportData();
    }, [viewportOptions, displaySets, dataSource]);

    /**
     * There are two scenarios for jump to click
     * 1. Current viewports contain the displaySet that the annotation was drawn on
     * 2. Current viewports don't contain the displaySet that the annotation was drawn on
     * and we need to change the viewports displaySet for jumping.
     * Since measurement_jump happens via events and listeners, the former case is handled
     * by the measurement_jump direct callback, but the latter case is handled first by
     * the viewportGrid to set the correct displaySet on the viewport, AND THEN we check
     * the cache for jumping to see if there is any jump queued, then we jump to the correct slice.
     */
    useEffect(() => {
      if (isJumpToMeasurementDisabled) {
        return;
      }

      const { unsubscribe } = measurementService.subscribe(
        MeasurementService.EVENTS.JUMP_TO_MEASUREMENT_VIEWPORT,
        event => handleJumpToMeasurement(event, elementRef, viewportId, cornerstoneViewportService)
      );

      return () => {
        unsubscribe();
      };
    }, [displaySets, elementRef, viewportId, isJumpToMeasurementDisabled, servicesManager]);

    // Set up the window level action menu in the viewport action corners.
    useEffect(() => {
      const windowLevelActionMenu = customizationService.getCustomization(
        'viewportActionMenu.windowLevelActionMenu'
      );
      const segmentationOverlay = customizationService.getCustomization(
        'viewportActionMenu.segmentationOverlay'
      );

      if (windowLevelActionMenu?.enabled) {
        viewportActionCornersService.addComponent({
          viewportId,
          id: 'windowLevelActionMenu',
          component: getWindowLevelActionMenu({
            viewportId,
            element: elementRef.current,
            displaySets,
            servicesManager,
            commandsManager,
            location: windowLevelActionMenu.location,
            verticalDirection: AllInOneMenu.VerticalDirection.TopToBottom,
            horizontalDirection: AllInOneMenu.HorizontalDirection.RightToLeft,
          }),
          location: windowLevelActionMenu.location,
        });
      }

      if (segmentationOverlay?.enabled) {
        viewportActionCornersService.addComponent({
          viewportId,
          id: 'segmentation',
          component: getViewportDataOverlaySettingsMenu({
            viewportId,
            element: elementRef.current,
            displaySets,
            servicesManager,
            commandsManager,
            location: segmentationOverlay.location,
          }),
          location: segmentationOverlay.location,
        });
      }
    }, [displaySets, viewportId, viewportActionCornersService, servicesManager, commandsManager]);

    const { ref: resizeRef } = useResizeDetector({
      onResize,
    });

    const Notification = customizationService.getCustomization('ui.notificationComponent');

    return (
      <React.Fragment>
        <div className="viewport-wrapper">
          <div
            className="cornerstone-viewport-element"
            style={{ height: '100%', width: '100%' }}
            onContextMenu={e => e.preventDefault()}
            onMouseDown={e => e.preventDefault()}
            ref={el => {
              resizeRef.current = el;
              elementRef.current = el;
            }}
          ></div>
          <CornerstoneOverlays
            viewportId={viewportId}
            toolBarService={toolbarService}
            element={elementRef.current}
            scrollbarHeight={scrollbarHeight}
            servicesManager={servicesManager}
          />
          <CinePlayer
            enabledVPElement={enabledVPElement}
            viewportId={viewportId}
            servicesManager={servicesManager}
          />
          <ActiveViewportBehavior
            viewportId={viewportId}
            servicesManager={servicesManager}
          />
        </div>
        {/* top offset of 24px to account for ViewportActionCorners. */}
        <div className="absolute top-[24px] w-full">
          {viewportDialogState.viewportId === viewportId && (
            <Notification
              id="viewport-notification"
              message={viewportDialogState.message}
              type={viewportDialogState.type}
              actions={viewportDialogState.actions}
              onSubmit={viewportDialogState.onSubmit}
              onOutsideClick={viewportDialogState.onOutsideClick}
              onKeyPress={viewportDialogState.onKeyPress}
            />
          )}
        </div>
        {/* The OHIFViewportActionCorners follows the viewport in the DOM so that it is naturally at a higher z-index.*/}
        <OHIFViewportActionCorners viewportId={viewportId} />
      </React.Fragment>
    );
  },
  areEqual
);

// Helper function to handle jumping to measurements
function handleJumpToMeasurement(event, elementRef, viewportId, cornerstoneViewportService) {
  const { measurement, isConsumed } = event;
  if (!measurement || isConsumed) {
    return;
  }

  const enabledElement = getEnabledElement(elementRef.current);

  if (!enabledElement) {
    return;
  }

  const viewport = enabledElement.viewport as csTypes.IStackViewport | csTypes.IVolumeViewport;

  const { metadata, displaySetInstanceUID } = measurement;

  const viewportDisplaySets = cornerstoneViewportService.getViewportDisplaySets(viewportId);

  const showingDisplaySet = viewportDisplaySets.find(
    ds => ds.displaySetInstanceUID === displaySetInstanceUID
  );

  let metadataToUse = metadata;
  // if it is not showing the displaySet we need to remove the FOR from the metadata
  if (!showingDisplaySet) {
    metadataToUse = {
      ...metadata,
      FrameOfReferenceUID: undefined,
    };
  }

  // Todo: make it work with cases where we want to define FOR based measurements too
  if (!viewport.isReferenceViewable(metadataToUse, WITH_NAVIGATION)) {
    return;
  }

  try {
    viewport.setViewReference(metadata);
    viewport.render();
  } catch (e) {
    console.warn('Unable to apply', metadata, e);
  }

  cs3DTools.annotation.selection.setAnnotationSelected(measurement.uid);
  event?.consume?.();
}

function _rehydrateSynchronizers(viewportId: string, syncGroupService: any) {
  const { synchronizersStore } = useSynchronizersStore.getState();
  const synchronizers = synchronizersStore[viewportId];

  if (!synchronizers) {
    return;
  }

  synchronizers.forEach(synchronizerObj => {
    if (!synchronizerObj.id) {
      return;
    }

    const { id, sourceViewports, targetViewports } = synchronizerObj;

    const synchronizer = syncGroupService.getSynchronizer(id);

    if (!synchronizer) {
      return;
    }

    const sourceViewportInfo = sourceViewports.find(
      sourceViewport => sourceViewport.viewportId === viewportId
    );

    const targetViewportInfo = targetViewports.find(
      targetViewport => targetViewport.viewportId === viewportId
    );

    const isSourceViewportInSynchronizer = synchronizer
      .getSourceViewports()
      .find(sourceViewport => sourceViewport.viewportId === viewportId);

    const isTargetViewportInSynchronizer = synchronizer
      .getTargetViewports()
      .find(targetViewport => targetViewport.viewportId === viewportId);

    // if the viewport was previously a source viewport, add it again
    if (sourceViewportInfo && !isSourceViewportInSynchronizer) {
      synchronizer.addSource({
        viewportId: sourceViewportInfo.viewportId,
        renderingEngineId: sourceViewportInfo.renderingEngineId,
      });
    }

    // if the viewport was previously a target viewport, add it again
    if (targetViewportInfo && !isTargetViewportInSynchronizer) {
      synchronizer.addTarget({
        viewportId: targetViewportInfo.viewportId,
        renderingEngineId: targetViewportInfo.renderingEngineId,
      });
    }
  });
}

// Component displayName
OHIFCornerstoneViewport.displayName = 'OHIFCornerstoneViewport';

function areEqual(prevProps, nextProps) {
  if (nextProps.needsRerendering) {
    console.debug('OHIFCornerstoneViewport: Rerender caused by: needsRerendering');
    return false;
  }

  if (prevProps.displaySets.length !== nextProps.displaySets.length) {
    console.debug('OHIFCornerstoneViewport: Rerender caused by: displaySets length change');
    return false;
  }

  if (prevProps.viewportOptions.orientation !== nextProps.viewportOptions.orientation) {
    console.debug('OHIFCornerstoneViewport: Rerender caused by: orientation change');
    return false;
  }

  if (prevProps.viewportOptions.toolGroupId !== nextProps.viewportOptions.toolGroupId) {
    console.debug('OHIFCornerstoneViewport: Rerender caused by: toolGroupId change');
    return false;
  }

  if (
    nextProps.viewportOptions.viewportType &&
    prevProps.viewportOptions.viewportType !== nextProps.viewportOptions.viewportType
  ) {
    console.debug('OHIFCornerstoneViewport: Rerender caused by: viewportType change');
    return false;
  }

  if (nextProps.viewportOptions.needsRerendering) {
    console.debug('OHIFCornerstoneViewport: Rerender caused by: viewportOptions.needsRerendering');
    return false;
  }

  const prevDisplaySets = prevProps.displaySets;
  const nextDisplaySets = nextProps.displaySets;

  if (prevDisplaySets.length !== nextDisplaySets.length) {
    console.debug('OHIFCornerstoneViewport: Rerender caused by: displaySets length mismatch');
    return false;
  }

  for (let i = 0; i < prevDisplaySets.length; i++) {
    const prevDisplaySet = prevDisplaySets[i];

    const foundDisplaySet = nextDisplaySets.find(
      nextDisplaySet =>
        nextDisplaySet.displaySetInstanceUID === prevDisplaySet.displaySetInstanceUID
    );

    if (!foundDisplaySet) {
      console.debug('OHIFCornerstoneViewport: Rerender caused by: displaySet not found');
      return false;
    }

    // check they contain the same image
    if (foundDisplaySet.images?.length !== prevDisplaySet.images?.length) {
      console.debug('OHIFCornerstoneViewport: Rerender caused by: images length mismatch');
      return false;
    }

    // check if their imageIds are the same
    if (foundDisplaySet.images?.length) {
      for (let j = 0; j < foundDisplaySet.images.length; j++) {
        if (foundDisplaySet.images[j].imageId !== prevDisplaySet.images[j].imageId) {
          console.debug('OHIFCornerstoneViewport: Rerender caused by: imageId mismatch');
          return false;
        }
      }
    }
  }

  return true;
}

// Helper function to check if display sets have changed
function haveDisplaySetsChanged(prevDisplaySets, currentDisplaySets) {
  if (prevDisplaySets.length !== currentDisplaySets.length) {
    return true;
  }

  return currentDisplaySets.some((currentDS, index) => {
    const prevDS = prevDisplaySets[index];
    return currentDS.displaySetInstanceUID !== prevDS.displaySetInstanceUID;
  });
}

export default OHIFCornerstoneViewport;
