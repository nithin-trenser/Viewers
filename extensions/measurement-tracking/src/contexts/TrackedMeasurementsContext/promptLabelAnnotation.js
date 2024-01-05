function promptLabelAnnotation({ servicesManager, extensionManager }, ctx, evt) {
  const { measurementService, uiDialogService } = servicesManager.services;
  const { viewportId, StudyInstanceUID, SeriesInstanceUID, measurementId } = evt;
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.common'
  );
  const { showLabelAnnotationPopup } = utilityModule.exports;
  return new Promise(async function (resolve) {
    const modeLabelConfig = measurementService.getLabelConfig();
    const value = await showLabelAnnotationPopup(
      measurementId,
      uiDialogService,
      modeLabelConfig,
      measurementService
    );

    measurementService.update(
      measurementId,
      {
        ...value,
      },
      true
    );

    resolve({
      StudyInstanceUID,
      SeriesInstanceUID,
      viewportId,
    });
  });
}

export default promptLabelAnnotation;
