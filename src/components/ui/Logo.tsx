import { FC } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const Logo: FC<LogoProps> = ({
  size = 32,
  className = '',
  showText = false,
}) => (
  <span className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-2 ${className}`.trim()}>
    <img
      src="/burgonomics-logo.png"
      alt="Burgonomics"
      width={size}
      height={size}
      className="block shrink-0 select-none object-contain"
      draggable={false}
    />
    {showText && (
      /* MonstroSolid wordmark at 400 — never a synthesised bold Inter
         stand-in. Wraps rather than being clipped when text is enlarged. */
      <span
        aria-hidden="true"
        className="brand-wordmark min-w-0 text-white"
      >
        Burgonomics
      </span>
    )}
  </span>
);

export default Logo;
