interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'mark' | 'emblem';
}

export default function Logo({size = 24, className = '', variant = 'mark'}: LogoProps) {
  if (variant === 'emblem') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        width={size}
        height={size}
        className={className}
        style={{flexShrink: 0, display: 'block'}}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#162217"/>
            <stop offset="50%" stopColor="#101811"/>
            <stop offset="100%" stopColor="#0a100b"/>
          </linearGradient>
          <linearGradient id="logoLime" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d6ff73"/>
            <stop offset="100%" stopColor="#93e622"/>
          </linearGradient>
          <mask id="logoBiteMask">
            <rect width="512" height="512" fill="#ffffff"/>
            <circle cx="340" cy="184" r="54" fill="#000000"/>
          </mask>
        </defs>
        <rect width="512" height="512" rx="124" fill="url(#logoBg)"/>
        <rect x="6" y="6" width="500" height="500" rx="118" fill="none" stroke="#253825" strokeWidth="4"/>
        <g fill="none" stroke="#a4f334" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 104 176 L 104 130 A 26 26 0 0 1 130 104 L 176 104"/>
          <path d="M 336 104 L 382 104 A 26 26 0 0 1 408 130 L 408 176"/>
          <path d="M 104 336 L 104 382 A 26 26 0 0 0 130 408 L 176 408"/>
          <path d="M 336 408 L 382 408 A 26 26 0 0 0 408 382 L 408 336"/>
        </g>
        <g mask="url(#logoBiteMask)">
          <circle cx="256" cy="256" r="114" fill="url(#logoLime)"/>
        </g>
        <circle cx="256" cy="256" r="46" fill="#111812"/>
        <circle cx="256" cy="256" r="38" fill="none" stroke="#bbf358" strokeWidth="4.5"/>
        <circle cx="244" cy="244" r="11" fill="#e8ff9e"/>
        <path d="M 238 136 C 238 98 272 90 290 86 C 290 108 278 132 250 141 Z" fill="#d6ff73"/>
      </svg>
    );
  }

  // Pure vector mark (viewfinder + plate with bite + aperture lens)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="none"
      style={{flexShrink: 0, display: 'block'}}
      aria-hidden="true"
    >
      <defs>
        <mask id="markBite">
          <rect width="32" height="32" fill="#ffffff"/>
          {/* Circular bite cutout on top right */}
          <circle cx="21.5" cy="11.5" r="3.6" fill="#000000"/>
        </mask>
      </defs>
      {/* Viewfinder brackets (Snap) */}
      <path
        d="M 6.5 11.5 V 8.5 A 2 2 0 0 1 8.5 6.5 H 11.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 20.5 6.5 H 23.5 A 2 2 0 0 1 25.5 8.5 V 11.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 6.5 20.5 V 23.5 A 2 2 0 0 0 8.5 25.5 H 11.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 20.5 25.5 H 23.5 A 2 2 0 0 0 25.5 23.5 V 20.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Food Plate with Bite Cutout (Bite) */}
      <circle
        cx="16"
        cy="16"
        r="7.2"
        fill="currentColor"
        mask="url(#markBite)"
      />
      {/* Inner Lens / Aperture aperture cutout */}
      <circle
        cx="16"
        cy="16"
        r="2.8"
        fill="#203015"
      />
      <circle
        cx="16"
        cy="16"
        r="1.4"
        fill="currentColor"
      />
      {/* Sprout Leaf */}
      <path
        d="M 15 8.5 C 15 6 17 5.5 18 5.2 C 18 6.5 17.2 8.2 15.6 8.8 Z"
        fill="currentColor"
      />
    </svg>
  );
}
