// shortcut: curated common areas, expand this directory when more cities are needed.
export const cityNames = ['杭州', '北京', '上海', '广州', '深圳', '成都', '重庆', '武汉', '南京', '苏州', '宁波', '温州', '合肥', '福州', '厦门', '南昌', '济南', '青岛', '郑州', '长沙', '西安', '天津', '石家庄', '太原', '沈阳', '大连', '长春', '哈尔滨', '南宁', '海口', '贵阳', '昆明', '兰州', '银川', '西宁', '乌鲁木齐', '呼和浩特'];

export async function loadDistricts(city: string): Promise<string[]> {
  const { default: districts } = await import('./districts.ts');
  return districts[city] ?? [];
}
