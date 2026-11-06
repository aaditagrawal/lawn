"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "group/avatar relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-[#1a1a1a]/10 dark:ring-white/10",
        className,
      )}
      {...props}
    />
  ),
);
Avatar.displayName = "Avatar";

const LoadingImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, style, onLoad, onError, ...props }, ref) => {
    const [loaded, setLoaded] = React.useState(false);
    return (
      <img
        {...props}
        ref={(image) => {
          // A cached image can complete before React attaches the load handler.
          if (!loaded && image?.complete && image.naturalWidth > 0) setLoaded(true);
          if (typeof ref === "function") return ref(image);
          if (ref) ref.current = image;
        }}
        data-avatar-loaded={loaded}
        className={cn("aspect-square h-full w-full object-cover", className)}
        style={{ ...style, display: loaded ? style?.display : "none" }}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          setLoaded(false);
          onError?.(event);
        }}
      />
    );
  },
);
LoadingImage.displayName = "LoadingImage";

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  (props, ref) =>
    props.src || props.srcSet ? (
      <LoadingImage
        key={`${props.src}\0${props.srcSet}\0${props.crossOrigin}\0${props.referrerPolicy}`}
        {...props}
        ref={ref}
      />
    ) : null,
);
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center bg-[#e8e8e0] text-sm font-bold text-[#1a1a1a] group-has-[[data-avatar-loaded=true]]/avatar:hidden",
        className,
      )}
      {...props}
    />
  ),
);
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
