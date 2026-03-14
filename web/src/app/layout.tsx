import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
})

export const metadata: Metadata = {
    title: 'ActuaryAI - Real-World Risk Modeling',
    description: 'Real-world risk modeling. Powered by prediction markets.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className="dark">
            <body className={`${inter.className} min-h-screen bg-zinc-950 text-zinc-100 antialiased`}>
                {children}
            </body>
        </html>
    )
}
