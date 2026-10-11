import { forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";

/** Drop-in replacement for next/link: accepts `href`, renders React Router Link. */
interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, ...rest }, ref) {
  if (/^(https?:|mailto:|tel:)/.test(href)) {
    return <a ref={ref} href={href} target="_blank" rel="noreferrer" {...rest} />;
  }
  return <RouterLink ref={ref} to={href} {...rest} />;
});

export default Link;
