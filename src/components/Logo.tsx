import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Logo({ className = "", size = 'md' }: LogoProps) {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-24 h-24'
  };

  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${sizes[size]} ${className}`}
    >
      {/* Background Shape - Soft Rounded Square */}
      <rect width="100" height="100" rx="24" fill="currentColor" fillOpacity="0.15" />
      
      {/* Three Mountains (Sierra Norte) */}
      <path 
        d="M20 75L40 35L60 75H20Z" 
        className="text-brand-primary"
        fill="currentColor" 
      />
      <path 
        d="M45 75L65 45L85 75H45Z" 
        className="text-brand-secondary"
        fill="currentColor" 
        fillOpacity="0.8"
      />
      <path 
        d="M35 75L50 55L65 75H35Z" 
        className="text-brand-accent text-white"
        fill="white" 
        fillOpacity="0.5"
      />

      {/* Broadcast Pulse / Eye / Sun */}
      <circle cx="50" cy="40" r="8" className="text-brand-primary" fill="currentColor" />
      <circle cx="50" cy="40" r="15" className="text-brand-primary" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 50 40"
          to="360 50 40"
          dur="10s"
          repeatCount="indefinite"
        />
      </circle>
      
      {/* Bottom bar / Platform base */}
      <rect x="20" y="80" width="60" height="4" rx="2" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}
