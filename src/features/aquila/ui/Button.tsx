import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }

/** A button. Defaults to type="button", so it never submits a form by accident. */
export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }

/** A link that looks like a button, for navigation. */
export function ButtonLink({ variant = 'secondary', size = 'md', className = '', ...props }: LinkProps) {
  return <a className={buttonClass(variant, size, className)} {...props} />
}
