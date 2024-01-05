import { FreehandROISculptorTool as SculptorTool, Types } from '@cornerstonejs/tools';

class FreehandROISculptorTool extends SculptorTool {
  static toolName = 'FreehandROISculptorTool';

  constructor(toolProps: Types.PublicToolProps = {}, defaultToolProps: Types.ToolProps) {
    super(toolProps, defaultToolProps);
    this.configuration.referencedToolNames = [
      ...this.configuration.referencedToolNames,
      'OpenFreehandROI',
      'ClosedFreehandROI',
    ];
  }
}

export default FreehandROISculptorTool;
