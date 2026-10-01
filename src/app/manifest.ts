import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "លុយឆ្លាត · LuySmart",
    short_name: "លុយឆ្លាត",
    description: "គ្រប់គ្រងលុយ និងបំណុល ផ្ទាល់ខ្លួន និងអាជីវកម្ម",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f9f6e",
    lang: "km",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  }
}
