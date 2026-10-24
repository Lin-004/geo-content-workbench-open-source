export const PLATFORMS = [
  { key: "toutiao", name: "今日头条", url: "https://mp.toutiao.com/" },
  { key: "baijiahao", name: "百家号", url: "https://baijiahao.baidu.com/" },
  { key: "zhihu", name: "知乎", url: "https://zhuanlan.zhihu.com/" },
  { key: "sohu", name: "搜狐", url: "https://mp.sohu.com/" },
  { key: "wechat", name: "公众号", url: "https://mp.weixin.qq.com/" },
  { key: "ctrip", name: "携程", url: "https://you.ctrip.com/" },
  { key: "meipian", name: "美篇", url: "https://www.meipian.cn/" },
  { key: "douyin", name: "抖音", url: "https://creator.douyin.com/" },
  { key: "wechat_channels", name: "视频号", url: "https://channels.weixin.qq.com/" },
  { key: "xiaohongshu", name: "小红书", url: "https://creator.xiaohongshu.com/" },
] as const;

export type PlatformKey = (typeof PLATFORMS)[number]["key"];
export const PLATFORM_OPTIONS = PLATFORMS.map(({ key, name }) => ({ label: name, value: key }));
