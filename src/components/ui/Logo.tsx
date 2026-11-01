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
  <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
    <img
      src="/burgonomics-logo.png"
      alt="Burgonomics"
      width={size}
      height={size}
      className="block shrink-0 select-none object-contain"
      draggable={false}
    />
    {showText && (
      <span
        aria-hidden="true"
        className="font-black uppercase tracking-[0.08em] text-white"
      >
        Burgonomics
      </span>
    )}
  </span>
);

export default Logo;