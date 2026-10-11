import type { Metadata } from "next"

// The page is a client component, so its window title lives here (absolute: not the site title again).
export const metadata: Metadata = { title: { absolute: "ចូលគណនី · អេប លុយឆ្លាត" } }

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
