import {
  Airplay,
  Cast,
  Play,
  Pause,
  RotateCcw,
  VolumeX,
  Volume1,
  Volume2,
  Subtitles,
  CaptionsOff,
  ClosedCaption,
  PictureInPicture,
  PictureInPicture2,
  Maximize,
  Minimize,
  Rewind,
  FastForward,
  Download,
  Accessibility,
  ArrowLeft,
  ArrowRight,
  Headphones,
  List,
  Settings,
  Volume,
  MonitorUp,
  MonitorDown,
  AArrowUp,
  AArrowDown,
  Droplet,
  Check,
  ChevronRight,
  ChevronLeft,
  Type,
  ListMusic,
} from "lucide-react";
import React from "react";

function createLucide(IconComponent: any) {
  return function LucideWrapper(props: any) {
    // Merge className properly to preserve vds-icon
    return (
      <IconComponent
        {...props}
        className={`size-7 sm:size-8 ${props.className || ""}`}
        strokeWidth={2}
      />
    );
  };
}

function createPlayLucide(IconComponent: any) {
  return function LucideWrapper(props: any) {
    return (
      <IconComponent
        {...props}
        className={`size-9 sm:size-10 ${props.className || ""}`}
        strokeWidth={2}
      />
    );
  };
}

const ClosedCaptionOff = (props: any) => {
  const maskId = `cc-slash-${Math.random().toString(36).substring(2, 9)}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <defs>
        <mask id={maskId}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <line x1="2" y1="2" x2="22" y2="22" stroke="black" strokeWidth="4" />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M10 9.17a3 3 0 1 0 0 5.66" />
        <path d="M17 9.17a3 3 0 1 0 0 5.66" />
      </g>
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
};

export const customVidstackIcons: any = {
  AirPlayButton: { Default: createLucide(Airplay) },
  GoogleCastButton: { Default: createLucide(Cast) },
  PlayButton: {
    Play: createPlayLucide(Play),
    Pause: createPlayLucide(Pause),
    Replay: createPlayLucide(RotateCcw),
  },
  MuteButton: {
    Mute: createLucide(VolumeX),
    VolumeLow: createLucide(Volume1),
    VolumeHigh: createLucide(Volume2),
  },
  CaptionButton: {
    On: createLucide(ClosedCaption),
    Off: createLucide(ClosedCaptionOff),
  },
  PIPButton: {
    Enter: createLucide(PictureInPicture),
    Exit: createLucide(PictureInPicture2),
  },
  FullscreenButton: {
    Enter: createLucide(Maximize),
    Exit: createLucide(Minimize),
  },
  SeekButton: {
    Backward: createLucide(Rewind),
    Forward: createLucide(FastForward),
  },
  DownloadButton: { Default: createLucide(Download) },
  Menu: {
    Accessibility: createLucide(Accessibility),
    ArrowLeft: createLucide(ChevronLeft),
    ArrowRight: createLucide(ChevronRight),
    Audio: createLucide(Headphones),
    Chapters: createLucide(List),
    Captions: createLucide(Type),
    Playback: createLucide(Play),
    Settings: createLucide(Settings),
    AudioBoostUp: createLucide(Volume2),
    AudioBoostDown: createLucide(Volume1),
    SpeedUp: createLucide(FastForward),
    SpeedDown: createLucide(Rewind),
    QualityUp: createLucide(MonitorUp),
    QualityDown: createLucide(MonitorDown),
    FontSizeUp: createLucide(AArrowUp),
    FontSizeDown: createLucide(AArrowDown),
    OpacityUp: createLucide(Droplet),
    OpacityDown: createLucide(Droplet),
    RadioCheck: createLucide(Check),
  },
  KeyboardDisplay: {
    Play: createLucide(Play),
    Pause: createLucide(Pause),
    Mute: createLucide(VolumeX),
    VolumeUp: createLucide(Volume2),
    VolumeDown: createLucide(Volume1),
    EnterFullscreen: createLucide(Maximize),
    ExitFullscreen: createLucide(Minimize),
    EnterPiP: createLucide(PictureInPicture),
    ExitPiP: createLucide(PictureInPicture2),
    CaptionsOn: createLucide(ClosedCaption),
    CaptionsOff: createLucide(ClosedCaptionOff),
    SeekForward: createLucide(FastForward),
    SeekBackward: createLucide(Rewind),
  },
};
