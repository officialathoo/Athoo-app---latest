import { useEffect, useState } from "react";
import { getPrivateFileAccessUrl, getPrivateFileUrl } from "@/lib/storage";
interface StorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> { objectPath: string | null | undefined; fallback?: React.ReactNode; }
export function StorageImage({ objectPath, fallback, alt, ...props }: StorageImageProps) {
  const [src, setSrc] = useState("");
  useEffect(() => { let active = true; if (!objectPath) { setSrc(""); return; } const base = getPrivateFileUrl(objectPath); if (!objectPath.startsWith("/objects/")) { setSrc(base); return; } getPrivateFileAccessUrl(objectPath).then((url) => { if (active) setSrc(url); }).catch(() => { if (active) setSrc(""); }); return () => { active = false; }; }, [objectPath]);
  if (!objectPath || !src) return fallback ? <>{fallback}</> : null;
  return <img src={src} alt={alt ?? ""} {...props} />;
}
