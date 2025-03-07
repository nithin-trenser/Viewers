import React from 'react';
import { useActiveViewportDisplaySets, useSystem } from '@ohif/core';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@ohif/ui-next';

import { AccordionGroup } from './AccordionGroup';
import MeasurementsOrAdditionalFindings from './MeasurementsOrAdditionalFindings';
import StudySummaryWithActions from './StudySummaryWithActions';

/**
 * Groups measurements by study in order to allow display and saving by study
 * @param {Object} servicesManager
 */
export const groupByStudy = (items, grouping, childProps) => {
  const groups = new Map();
  const { activeStudyUID } = grouping;
  const { displaySetService } = childProps.servicesManager.services;

  const getItemStudyInstanceUID = item => {
    const displaySet = displaySetService.getDisplaySetByUID(item.displaySetInstanceUID);
    return displaySet.instances[0].StudyInstanceUID;
  };

  let firstSelected, firstGroup;

  items.forEach(item => {
    const studyUID = getItemStudyInstanceUID(item);
    if (!groups.has(studyUID)) {
      const items = [];
      const group = {
        ...grouping,
        items,
        displayMeasurements: items,
        headerProps: {
          ...grouping.headerProps,
          items,
          StudyInstanceUID: studyUID,
        },
        key: studyUID,
        isSelected: studyUID === activeStudyUID,
      };
      if (group.isSelected && !firstSelected) {
        firstSelected = group;
      }
      firstGroup ||= group;
      groups.set(studyUID, group);
    }
    if (!firstSelected && firstGroup) {
      firstGroup.isSelected = true;
    }
    const group = groups.get(studyUID);
    group.items.push(item);
  });

  return groups;
};

export function StudyMeasurementItem(props) {
  const { group, key = group.key, children } = props;
  const {
    component: ChildComponent = MeasurementsOrAdditionalFindings,
    header: Header = StudySummaryWithActions,
    headerProps,
  } = group;
  const CloneChildren = cloneProps => {
    if (children) {
      return React.Children.map(children, child =>
        React.cloneElement(child, {
          ...cloneProps,
          ...group,
          key,
        })
      );
    }
    return <ChildComponent {...props} />;
  };

  return (
    <AccordionItem
      value={key}
      data-state="open"
    >
      <AccordionTrigger>
        <Header
          StudyInstanceUID={key}
          {...props}
          {...headerProps}
        />
      </AccordionTrigger>
      <AccordionContent>
        <CloneChildren />
      </AccordionContent>
    </AccordionItem>
  );
}

export function StudyMeasurements(props): React.ReactNode {
  const { items, grouping = {}, children } = props;

  const system = useSystem();
  const activeDisplaySets = useActiveViewportDisplaySets(system);
  const activeStudyUID = activeDisplaySets?.[0]?.StudyInstanceUID;

  return (
    <AccordionGroup
      grouping={{
        name: 'groupByStudy',
        groupingFunction: groupByStudy,
        header: StudySummaryWithActions,
        activeStudyUID,
        ...grouping,
      }}
      items={items}
      value={[activeStudyUID]}
    >
      <StudyMeasurementItem
        activeStudyUID={activeStudyUID}
        children={children}
      />
    </AccordionGroup>
  );
}

export default StudyMeasurements;
