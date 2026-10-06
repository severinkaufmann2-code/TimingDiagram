/** Line icons, drawn on a 16 px grid in the current text colour. */

import type { ReactNode } from 'react';

function Icon({ children, size = 16, filled = false }: { children: ReactNode; size?: number; filled?: boolean }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const LogoIcon = () => (
  <Icon>
    <path d="M2 11H5V5H8.5L11 11H14" />
  </Icon>
);
export const UndoIcon = () => (
  <Icon>
    <path d="M6 4L3 7L6 10" />
    <path d="M3 7H10A3.5 3.5 0 0 1 10 14H7" />
  </Icon>
);
export const RedoIcon = () => (
  <Icon>
    <path d="M10 4L13 7L10 10" />
    <path d="M13 7H6A3.5 3.5 0 0 0 6 14H9" />
  </Icon>
);
export const PlusIcon = () => (
  <Icon>
    <path d="M8 3V13M3 8H13" />
  </Icon>
);
export const MinusIcon = () => (
  <Icon>
    <path d="M3 8H13" />
  </Icon>
);
export const FitIcon = () => (
  <Icon>
    <path d="M3 6V3H6M10 3H13V6M13 10V13H10M6 13H3V10" />
  </Icon>
);
export const ChevronDownIcon = () => (
  <Icon>
    <path d="M4 6L8 10L12 6" />
  </Icon>
);
export const ChevronUpIcon = () => (
  <Icon>
    <path d="M4 10L8 6L12 10" />
  </Icon>
);
export const ChevronRightIcon = () => (
  <Icon>
    <path d="M6 4L10 8L6 12" />
  </Icon>
);
export const MoreIcon = () => (
  <Icon filled>
    <circle cx="3.5" cy="8" r="1.25" />
    <circle cx="8" cy="8" r="1.25" />
    <circle cx="12.5" cy="8" r="1.25" />
  </Icon>
);
export const CommentIcon = () => (
  <Icon>
    <path d="M2.5 3H13.5V10.5H8.5L5.5 13.5V10.5H2.5Z" />
  </Icon>
);
export const GroupIcon = () => (
  <Icon>
    <path d="M2.5 3H13.5V13H2.5ZM2.5 6.5H13.5" />
  </Icon>
);
export const PhaseIcon = () => (
  <Icon>
    <path d="M2.5 5V11M13.5 5V11M2.5 8H13.5" />
  </Icon>
);
export const PointIcon = () => (
  <Icon>
    <path d="M5 2.5H11V6H5ZM8 6V13.5" />
  </Icon>
);
export const CopyIcon = () => (
  <Icon>
    <path d="M5.5 5.5H13V13H5.5ZM3 10.5V3H10.5" />
  </Icon>
);
export const RowsIcon = () => (
  <Icon>
    <path d="M3 4.5H13M3 8H13M3 11.5H13" />
  </Icon>
);
export const FolderIcon = () => (
  <Icon>
    <path d="M2 12.5V4H6.5L8 5.5H14V12.5Z" />
  </Icon>
);
export const SaveIcon = () => (
  <Icon>
    <path d="M8 2.5V10.5M5 7.5L8 10.5L11 7.5M3 13.5H13" />
  </Icon>
);
export const ExportIcon = () => (
  <Icon>
    <path d="M8 10V2.5M5 5.5L8 2.5L11 5.5M3 9.5V13.5H13V9.5" />
  </Icon>
);
export const FileIcon = () => (
  <Icon>
    <path d="M4 2.5H9.5L12 5V13.5H4Z" />
    <path d="M9.5 2.5V5H12" />
  </Icon>
);
export const TrashIcon = () => (
  <Icon>
    <path d="M3 4.5H13M6.5 4.5V3H9.5V4.5M4.5 4.5L5 13H11L11.5 4.5M7 7V10.5M9 7V10.5" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M4 4L12 12M12 4L4 12" />
  </Icon>
);
export const GripIcon = () => (
  <Icon filled>
    <circle cx="6" cy="4" r="1.1" />
    <circle cx="10" cy="4" r="1.1" />
    <circle cx="6" cy="8" r="1.1" />
    <circle cx="10" cy="8" r="1.1" />
    <circle cx="6" cy="12" r="1.1" />
    <circle cx="10" cy="12" r="1.1" />
  </Icon>
);
export const SunIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" />
  </Icon>
);
export const MoonIcon = () => (
  <Icon>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3A5.5 5.5 0 1 0 13 9.5Z" />
  </Icon>
);
export const HelpIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.3 6.2A1.8 1.8 0 1 1 8 8.3V9.3" />
    <path d="M8 11.4V11.5" />
  </Icon>
);
export const TableIcon = () => (
  <Icon>
    <path d="M2.5 3.5H13.5V12.5H2.5ZM2.5 6.5H13.5M2.5 9.5H13.5M6.5 3.5V12.5" />
  </Icon>
);
export const ArrowUpIcon = () => (
  <Icon>
    <path d="M8 13V3M4 7L8 3L12 7" />
  </Icon>
);
export const ArrowDownIcon = () => (
  <Icon>
    <path d="M8 3V13M4 9L8 13L12 9" />
  </Icon>
);

/** The shape a channel takes between two points: hold and jump. */
export const StepIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M2.5 12.5H8V3.5H13.5" />
  </Icon>
);
/** The shape a channel takes between two points: gradual change. */
export const RampIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M2.5 12.5L13.5 3.5" />
  </Icon>
);
