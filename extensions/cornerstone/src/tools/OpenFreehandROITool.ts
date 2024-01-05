import { PlanarFreehandROITool, Types } from '@cornerstonejs/tools';

class OpenFreehandROITool extends PlanarFreehandROITool {
  static toolName = 'OpenFreehandROI';

  constructor(toolProps: Types.PublicToolProps = {}, defaultToolProps: Types.ToolProps) {
    super(toolProps, defaultToolProps);
    this.configuration.allowOpenContours = true;
    this.configuration.calculateStats = true;
  }
}

export default OpenFreehandROITool;
