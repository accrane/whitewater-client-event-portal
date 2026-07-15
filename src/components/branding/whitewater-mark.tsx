type WhitewaterMarkProps = {
  className?: string;
};

// Whitewater "W" wave mark (from supplies/logos/w.svg). Renders in
// currentColor so it works on dark or light surfaces.
export function WhitewaterMark({ className }: WhitewaterMarkProps) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="currentColor"
      viewBox="0 0 68 54"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M34.4,41.3s-1.5,2.3.8,1.3c0,0,12.3-5,9.4-17.2,0,0-.2-.6.7-.2,2.4,1.1,8.8,6.9,2.8,24.5,0,0-1.1,2.5.8,1.3,0,0,17.6-10.1,16-27.3,0,0-.8-14.7-18.7-20.3,0,0-3-.8-5-.7,0,0-3.2.1-.9,1.3,0,0,12.9,5,15.5,18.3,0,0,0,.2,0,.4,0,.2-.3.6-.9.2-.3-.2-.5-.4-.6-.6-7.9-11.9-22.3-11.8-22.3-11.8,0,0-2.7-.1-1.3,1,0,0,5.3,4.3,5.9,9.6,0,0,.2.9-.8.5-2.6-1.2-6.1-4.3-31-3.7,0,0,0,.2-.1.3l-.3.7c-.2.5-.3,1.1-.5,1.6l-.2.9c0,.2,0,.3-.1.5,15,.4,22,1.9,25.9,3.8,0,0,11.3,4.6,5,15.6Z" />
    </svg>
  );
}
