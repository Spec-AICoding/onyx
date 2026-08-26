import type { IconProps } from "@opal/types";
import { cn } from "@opal/utils";

/**
 * MagicBox 品牌 Logo：魔盒（立方体礼物盒 + 丝带）+ 魔法星光。
 * 填充色跟随 --theme-primary-05 token，主题覆盖自动生效。
 */
export function MagicBoxLogo({ size = 24, className, ...props }: IconProps) {
  return (
    <svg
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      {...props}
    >
      {/* 盒体左面 */}
      <path d="M8 26 L28 15 L28 45 L8 56 Z" fill="var(--theme-primary-05)" />
      {/* 盒体右面 */}
      <path
        d="M28 15 L48 26 L48 56 L28 45 Z"
        fill="var(--theme-primary-05)"
        opacity="0.72"
      />
      {/* 盒体顶面 */}
      <path d="M8 26 L28 15 L48 26 L28 37 Z" fill="var(--theme-primary-05)" />
      {/* 顶面丝带 */}
      <path d="M25 15 L31 15 L31 37 L28 42 L25 37 Z" fill="var(--theme-primary-06)" />
      {/* 前面丝带 */}
      <path d="M25 37 L31 37 L31 45 L28 45 Z" fill="var(--theme-primary-06)" />
      {/* 蝴蝶结 */}
      <path d="M14 10 L28 15 L18 25 Z" fill="var(--theme-primary-05)" />
      <path d="M42 10 L28 15 L38 25 Z" fill="var(--theme-primary-05)" />
      {/* 魔法星光（右上） */}
      <path
        d="M56 2 L58 8 L64 10 L58 12 L56 18 L54 12 L48 10 L54 8 Z"
        fill="var(--theme-primary-05)"
      />
      {/* 魔法星光（左下，小） */}
      <path
        d="M4 44 L5 47 L8 48 L5 49 L4 52 L3 49 L0 48 L3 47 Z"
        fill="var(--theme-primary-05)"
      />
    </svg>
  );
}

/**
 * MagicBox 字标版 Logo：图标 + "MagicBox" 文字。
 */
export function MagicBoxLogoTyped({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 shrink-0", className)}>
      <MagicBoxLogo size={size} />
      <span
        className="font-bold text-theme-primary-05"
        style={{ fontSize: size * 0.6, lineHeight: 1, letterSpacing: "-0.02em" }}
      >
        MagicBox
      </span>
    </span>
  );
}
