import React, { useState, useEffect, useRef } from "react";

interface ImageWithSkeletonProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  wrapperClassName?: string;
  skeletonClassName?: string;
  fallbackSrc?: string;
}

export function ImageWithSkeleton({
  src,
  alt = "",
  className = "",
  wrapperClassName = "",
  skeletonClassName = "",
  fallbackSrc,
  ...props
}: ImageWithSkeletonProps) {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      const raf = requestAnimationFrame(() => setIsLoaded(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [currentSrc]);

  const handleError = () => {
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setIsLoaded(false);
    } else {
      setHasError(true);
      setIsLoaded(true);
    }
  };

  return (
    <div className={`relative overflow-hidden bg-card/40 ${wrapperClassName}`}>
      <div
        className={`absolute inset-0 size-full skeleton-box z-0 pointer-events-none flex items-center justify-center transition-opacity duration-500 ease-out ${
          isLoaded && !hasError ? "opacity-0" : "opacity-100"
        } ${skeletonClassName}`}
      >
        {hasError && (
          <span className="text-[10px] text-muted-foreground/50 font-medium px-2 text-center select-none">
            {alt || "Image"}
          </span>
        )}
      </div>
      {!hasError && currentSrc ? (
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          referrerPolicy="no-referrer"
          decoding="async"
          loading={props.loading || "lazy"}
          onLoad={(e) => {
            requestAnimationFrame(() => setIsLoaded(true));
            props.onLoad?.(e);
          }}
          onError={handleError}
          className={`relative z-10 size-full transition-opacity duration-500 ease-out ${
            isLoaded ? "opacity-100" : "opacity-0"
          } ${className}`}
          {...props}
        />
      ) : null}
    </div>
  );
}
