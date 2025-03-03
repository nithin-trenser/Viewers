import React from 'react';
import { utils } from '@ohif/core';
import { useViewportGrid, Button, Icons, MeasurementTable } from '@ohif/ui-next';
import { PanelMeasurement, StudySummaryFromMetadata } from '@ohif/extension-cornerstone';
import { useTrackedMeasurements } from '../getContextModule';

const { filterAnd, filterPlanarMeasurement, filterMeasurementsBySeriesUID } =
  utils.MeasurementFilters;

function PanelMeasurementTableTracking({
  servicesManager,
  extensionManager,
  commandsManager,
}: withAppTypes) {
  const [viewportGrid] = useViewportGrid();
  const { customizationService } = servicesManager.services;
  const [trackedMeasurements, sendTrackedMeasurementsEvent] = useTrackedMeasurements();
  const { trackedStudy, trackedSeries } = trackedMeasurements.context;
  const measurementFilter = trackedStudy
    ? filterAnd(filterPlanarMeasurement, filterMeasurementsBySeriesUID(trackedSeries))
    : filterPlanarMeasurement;

  const disableEditing = customizationService.getCustomization('panelMeasurement.disableEditing');

  function CustomMenu({ items, StudyInstanceUID, measurementFilter }) {
    const disabled = !items?.length;

    if (disableEditing || disabled) {
      return null;
    }

    return (
      <div className="bg-background flex h-9 w-full items-center rounded pr-0.5">
        <div className="flex space-x-1">
          <Button
            size="sm"
            variant="ghost"
            className="pl-1.5"
            onClick={() => {
              commandsManager.runCommand('downloadCSVMeasurementsReport', {
                measurementFilter,
              });
            }}
          >
            <Icons.Download className="h-5 w-5" />
            <span className="pl-1">CSV</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="pl-0.5"
            onClick={e => {
              e.stopPropagation();
              sendTrackedMeasurementsEvent('SAVE_REPORT', {
                viewportId: viewportGrid.activeViewportId,
                isBackupSave: true,
                StudyInstanceUID,
                measurementFilter,
              });
            }}
          >
            <Icons.Add />
            Create SR
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="pl-0.5"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();

              commandsManager.runCommand('clearMeasurements', {
                measurementFilter,
              });
            }}
          >
            <Icons.Delete />
            Delete All
          </Button>
        </div>
      </div>
    );
  }

  const EmptyComponent = () => (
    <MeasurementTable title="Measurements">
      <MeasurementTable.Body />
    </MeasurementTable>
  );

  return (
    <>
      <PanelMeasurement
        servicesManager={servicesManager}
        extensionManager={extensionManager}
        commandsManager={commandsManager}
        measurementFilter={measurementFilter}
        emptyComponent={EmptyComponent}
        componentProps={{
          grouping: {
            header: props => (
              <div>
                <StudySummaryFromMetadata {...props} />
                <CustomMenu {...props} />
              </div>
            ),
          },
        }}
      />
    </>
  );
}

export default PanelMeasurementTableTracking;
