import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "GEO内容交付工作台",
  description: "GEO 内容规划、审核和多平台发布工作台",
};

export default function BusinessLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
