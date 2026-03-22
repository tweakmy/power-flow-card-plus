interface FlowViewBoxOptions {
  width?: number;
  height?: number;
}

const DEFAULT_VIEW_BOX_WIDTH = 100;
const DEFAULT_VIEW_BOX_HEIGHT = 100;

export const getFlowViewBox = ({ width = DEFAULT_VIEW_BOX_WIDTH, height = DEFAULT_VIEW_BOX_HEIGHT }: FlowViewBoxOptions = {}) => {
  return `0 0 ${width} ${height}`;
};

export const getMainFlowViewBox = (hasBottomRow: boolean) => {
  return getFlowViewBox({ height: hasBottomRow ? 110 : DEFAULT_VIEW_BOX_HEIGHT });
};

export const getRightIndividualFlowViewBox = (hasBottomRow: boolean) => {
  return getFlowViewBox({ height: hasBottomRow ? 110 : DEFAULT_VIEW_BOX_HEIGHT });
};
