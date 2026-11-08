import { useState, useEffect, useRef } from "react";

export function CachedImage({
  src,
  alt,
  className = "",
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setError(false);
    setLoaded(false);
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      const raf = requestAnimationFrame(() => setLoaded(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [src]);

  if (error || !src) {
    // Fallback if the image fails to load
    return <div className={`bg-white/10 rounded-sm ${className}`} />;
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={`transition-opacity duration-500 ease-out ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      referrerPolicy="no-referrer"
      decoding="async"
      loading={props.loading || "lazy"}
      onLoad={(e) => {
        requestAnimationFrame(() => setLoaded(true));
        props.onLoad?.(e);
      }}
      onError={() => setError(true)}
      {...props}
    />
  );
}
