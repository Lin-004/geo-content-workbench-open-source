import type { ReactNode } from "react";

export type IconName =
  | "grid"
  | "content"
  | "planning"
  | "settings"
  | "help"
  | "menu"
  | "calendar"
  | "search"
  | "bell"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "plus"
  | "upload"
  | "refresh"
  | "filter"
  | "edit"
  | "trash"
  | "eye"
  | "lock"
  | "info"
  | "check"
  | "clock"
  | "send"
  | "download"
  | "external"
  | "user"
  | "file"
  | "folder"
  | "close";

export function Icon({ name, size = 20, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  let content: ReactNode;
  switch (name) {
    case "grid": content = <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /></> ; break;
    case "content": content = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>; break;
    case "planning": content = <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M7 2v4M17 2v4M3 9h18M8 13h3M8 17h3M15 13h2" /></>; break;
    case "settings": content = <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></>; break;
    case "help": content = <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.9 1.7c-1.3 1.1-1.7 1.5-1.7 3M12 17h.01" /></>; break;
    case "menu": content = <><path d="M4 7h16M4 12h16M4 17h16" /></>; break;
    case "calendar": content = <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M7 2v4M17 2v4M3 9h18M7 13h.01M11 13h.01M15 13h.01M7 17h.01M11 17h.01" /></>; break;
    case "search": content = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>; break;
    case "bell": content = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>; break;
    case "chevron-down": content = <path d="m6 9 6 6 6-6" />; break;
    case "chevron-left": content = <path d="m15 18-6-6 6-6" />; break;
    case "chevron-right": content = <path d="m9 18 6-6-6-6" />; break;
    case "plus": content = <><path d="M12 5v14M5 12h14" /></>; break;
    case "upload": content = <><path d="M12 16V4M8 8l4-4 4 4M4 15v4h16v-4" /></>; break;
    case "refresh": content = <><path d="M20 11a8 8 0 0 0-14.8-4L3 10M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14m0 5v-5h-5" /></>; break;
    case "filter": content = <path d="M4 5h16l-6.5 7.2V18l-3 1v-6.8L4 5Z" />; break;
    case "edit": content = <><path d="m4 16-.8 4.8L8 20l11.2-11.2a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>; break;
    case "trash": content = <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>; break;
    case "eye": content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break;
    case "lock": content = <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>; break;
    case "info": content = <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>; break;
    case "check": content = <path d="m5 12 4 4L19 6" />; break;
    case "clock": content = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>; break;
    case "send": content = <path d="m21 3-7.5 18-3.6-7L3 10.5 21 3ZM10 14l5-5" />; break;
    case "download": content = <><path d="M12 3v12M7 11l5 5 5-5M4 20h16" /></>; break;
    case "external": content = <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>; break;
    case "user": content = <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>; break;
    case "file": content = <><path d="M6 3h8l4 4v14H6zM14 3v5h5" /><path d="M9 13h6M9 17h6" /></>; break;
    case "folder": content = <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />; break;
    case "close": content = <><path d="m6 6 12 12M18 6 6 18" /></>; break;
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{content}</svg>;
}
