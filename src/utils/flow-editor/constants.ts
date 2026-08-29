// FlowEditor 相关常量定义

// 节点卡片尺寸常量
export const NODE_W = 260;   // 窄屏基准宽度
export const NODE_H = 96;    // 估计高度（头部 + 内容 + margin）

// 卡片节点样式常量
export const CARD_NODE_W = 140;  // 卡片节点宽度
export const CARD_NODE_H = 48;   // 卡片节点高度

// 画布缩放常量
export const SCALE_MIN = 0.25;   // 最小缩放比例
export const SCALE_MAX = 3;      // 最大缩放比例
export const SCALE_STEP = 0.1;   // 缩放步长

// 碰撞检测常量
export const SNAP_THRESHOLD = 10;     // 磁吸阈值（像素）
export const COLLISION_THRESHOLD = 5;  // 碰撞检测阈值（像素）

// 动画和保存常量
export const ANIMATION_DURATION = 300; // 动画时长（毫秒）
export const AUTO_SAVE_DELAY = 500;    // 自动保存延迟（毫秒）

// 存储键常量
export const VIEWPORT_KEY = 'dnd-flow-viewport-snapshots';
export const FLOW_KEY = 'dnd-flow-library';