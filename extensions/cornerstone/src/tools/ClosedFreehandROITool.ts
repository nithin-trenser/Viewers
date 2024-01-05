import { PlanarFreehandROITool, Types } from '@cornerstonejs/tools';

class ClosedFreehandROITool extends PlanarFreehandROITool {
  static toolName = 'ClosedFreehandROI';

  constructor(toolProps: Types.PublicToolProps = {}, defaultToolProps: Types.ToolProps) {
    super(toolProps, defaultToolProps);
    this.configuration.allowOpenContours = false;
    this.configuration.calculateStats = true;
  }
}

export default ClosedFreehandROITool;
