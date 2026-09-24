import { FC } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const Logo: FC<LogoProps> = ({ 
  size = 32, 
  className = '', 
  showText = false 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-label="Burgonomics"
  >
    <defs>
      <linearGradient id="burgGreen" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0E4825" />
        <stop offset="100%" stopColor="#4ADE80" />
      </linearGradient>
    </defs>
    {/* Background circle */}
    <circle cx="100" cy="100" r="96" fill="url(#burgGreen)" />
    {/* Burger icon */}
    <g transform="translate(50, 40)">
      {/* Top bun */}
      <ellipse cx="50" cy="20" rx="35" ry="12" fill="#FFFFFF" />
      {/* Patty */}
      <ellipse cx="50" cy="35" rx="30" ry="8" fill="#0E4825" />
      {/* Cheese */}
      <ellipse cx="50" cy="30" rx="28" ry="5" fill="#FFD700" />
      {/* Lettuce */}
      <path d="M15 40 Q25 35 35 40 Q45 45 55 40 Q65 35 75 40 Q85 45 95 40" stroke="#4ADE80" strokeWidth="3" fill="none" />
      {/* Bottom bun */}
      <ellipse cx="50" cy="55" rx="35" ry="12" fill="#FFFFFF" />
      {/* Sesame seeds */}
      <circle cx="40" cy="15" r="2" fill="#8B7355" />
      <circle cx="60" cy="12" r="2" fill="#8B7355" />
      <circle cx="55" cy="18" r="2" fill="#8B7355" />
      <circle cx="45" cy="16" r="2" fill="#8B7355" />
    </g>
    {showText && (
      <text
        x="100"
        y="170"
        fontFamily="system-ui, sans-serif"
        fontSize="20"
        fontWeight="bold"
        fill="white"
        textAnchor="middle"
        letterSpacing="1"
        textLength="120"
        lengthAdjust="spacingAndGlyphs"
      >
        BURGONOMICS
      </text>
    )}
  </svg>
);

export default Logo;