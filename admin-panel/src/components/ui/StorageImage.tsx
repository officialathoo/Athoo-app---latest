import {
  useEffect,
  useState,
} from "react";

import {
  getPrivateFileAccessUrl,
  getPrivateFileUrl,
} from "@/lib/storage";

interface StorageImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  objectPath:
    | string
    | null
    | undefined;

  fallback?: React.ReactNode;
}

export function StorageImage({
  objectPath,
  fallback,
  alt,
  onError,
  ...props
}: StorageImageProps) {
  const [src, setSrc] =
    useState("");

  const [failed, setFailed] =
    useState(false);

  useEffect(() => {
    let active = true;

    setSrc("");
    setFailed(false);

    if (!objectPath) {
      return () => {
        active = false;
      };
    }

    const base =
      getPrivateFileUrl(objectPath);

    if (
      !objectPath.startsWith("/objects/")
    ) {
      setSrc(base);

      return () => {
        active = false;
      };
    }

    getPrivateFileAccessUrl(objectPath)
      .then((url) => {
        if (active) {
          setSrc(url);
        }
      })
      .catch(() => {
        if (active) {
          setSrc("");
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [objectPath]);

  if (
    !objectPath ||
    !src ||
    failed
  ) {
    return fallback
      ? <>{fallback}</>
      : null;
  }

  return (
    <img
      src={src}
      alt={alt ?? ""}
      {...props}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
