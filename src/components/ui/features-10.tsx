import { Card, CardContent, CardHeader } from '@/components/ui/shadcn-card'
import { cn } from '@/lib/utils'
import { Calendar, LucideIcon, MapIcon } from 'lucide-react'
import { ReactNode } from 'react'
import Image from 'next/image'

export function Features() {
    return (
        <section className="bg-slate-950 py-16 md:py-32 w-full z-10 relative">
            <div className="mx-auto max-w-2xl px-6 lg:max-w-5xl">
                <div className="mx-auto grid gap-4 lg:grid-cols-2">
                    <FeatureCard>
                        <CardHeader className="pb-3">
                            <CardHeading
                                icon={MapIcon}
                                title="Real time execution tracking"
                                description="Advanced workflow tracking system. Instantly locate where your agents are."
                            />
                        </CardHeader>

                        <div className="relative mb-6 border-t border-dashed border-slate-800 sm:mb-0">
                            <div className="absolute inset-0 [background:radial-gradient(125%_125%_at_50%_0%,transparent_40%,#1e293b,transparent_125%)]"></div>
                            <div className="aspect-[76/59] p-1 px-6">
                                <DualModeImage
                                    darkSrc="https://tailark.com/_next/image?url=%2Fpayments.png&w=3840&q=75"
                                    lightSrc="https://tailark.com/_next/image?url=%2Fpayments-light.png&w=3840&q=75"
                                    alt="payments illustration"
                                    width={1207}
                                    height={929}
                                />
                            </div>
                        </div>
                    </FeatureCard>

                    <FeatureCard>
                        <CardHeader className="pb-3">
                            <CardHeading
                                icon={Calendar}
                                title="Advanced Scheduling"
                                description="Schedule workflow runs. Trigger your AI agents at specific times."
                            />
                        </CardHeader>

                        <CardContent>
                            <div className="relative mb-6 sm:mb-0">
                                <div className="absolute -inset-6 [background:radial-gradient(50%_50%_at_75%_50%,transparent,#020617_100%)]"></div>
                                <div className="aspect-[76/59] border border-slate-800 rounded-lg overflow-hidden">
                                    <DualModeImage
                                        darkSrc="https://tailark.com/_next/image?url=%2Forigin-cal-dark.png&w=3840&q=75"
                                        lightSrc="https://tailark.com/_next/image?url=%2Forigin-cal.png&w=3840&q=75"
                                        alt="calendar illustration"
                                        width={1207}
                                        height={929}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </FeatureCard>

                    <FeatureCard className="p-6 lg:col-span-2 flex flex-col items-center">
                        <p className="mx-auto my-6 max-w-md text-balance text-center text-2xl font-semibold text-white">Smart workflow routing with conditional logic.</p>

                        <div className="flex justify-center gap-6 overflow-hidden w-full max-w-lg mt-4">
                            <CircularUI
                                label="Decision"
                                circles={[{ pattern: 'border' }, { pattern: 'border' }]}
                            />

                            <CircularUI
                                label="Processing"
                                circles={[{ pattern: 'none' }, { pattern: 'primary' }]}
                            />

                            <CircularUI
                                label="Database"
                                circles={[{ pattern: 'blue' }, { pattern: 'none' }]}
                            />

                            <CircularUI
                                label="Notification"
                                circles={[{ pattern: 'primary' }, { pattern: 'none' }]}
                                className="hidden sm:block"
                            />
                        </div>
                    </FeatureCard>
                </div>
            </div>
        </section>
    )
}

interface FeatureCardProps {
    children: ReactNode
    className?: string
}

const FeatureCard = ({ children, className }: FeatureCardProps) => (
    <Card className={cn('group relative rounded-xl shadow-none overflow-hidden bg-slate-900/40 border-slate-800 backdrop-blur-sm', className)}>
        <CardDecorator />
        {children}
    </Card>
)

const CardDecorator = () => (
    <>
        <span className="border-indigo-500 absolute -left-px -top-px block size-2 border-l-2 border-t-2"></span>
        <span className="border-indigo-500 absolute -right-px -top-px block size-2 border-r-2 border-t-2"></span>
        <span className="border-indigo-500 absolute -bottom-px -left-px block size-2 border-b-2 border-l-2"></span>
        <span className="border-indigo-500 absolute -bottom-px -right-px block size-2 border-b-2 border-r-2"></span>
    </>
)

interface CardHeadingProps {
    icon: LucideIcon
    title: string
    description: string
}

const CardHeading = ({ icon: Icon, title, description }: CardHeadingProps) => (
    <div className="p-6">
        <span className="text-indigo-400 flex items-center gap-2 font-medium">
            <Icon className="size-5" />
            {title}
        </span>
        <p className="mt-4 text-2xl font-semibold text-white leading-snug">{description}</p>
    </div>
)

interface DualModeImageProps {
    darkSrc: string
    lightSrc: string
    alt: string
    width: number
    height: number
    className?: string
}

const DualModeImage = ({ darkSrc, lightSrc, alt, width, height, className }: DualModeImageProps) => (
    <>
        <img
            src={darkSrc}
            className={cn('block', className)}
            alt={`${alt} dark`}
            width={width}
            height={height}
        />
    </>
)

interface CircleConfig {
    pattern: 'none' | 'border' | 'primary' | 'blue'
}

interface CircularUIProps {
    label: string
    circles: CircleConfig[]
    className?: string
}

const CircularUI = ({ label, circles, className }: CircularUIProps) => (
    <div className={className}>
        <div className="bg-gradient-to-b from-slate-700 size-fit rounded-2xl to-transparent p-px">
            <div className="bg-gradient-to-b from-slate-900 to-slate-800/25 relative flex aspect-square w-fit items-center -space-x-4 rounded-[15px] p-4">
                {circles.map((circle, i) => (
                    <div
                        key={i}
                        className={cn('size-10 rounded-full border border-slate-700', {
                            'border-indigo-500': circle.pattern === 'none',
                            'border-indigo-500 bg-[repeating-linear-gradient(-45deg,#334155,#334155_1px,transparent_1px,transparent_4px)]': circle.pattern === 'border',
                            'border-indigo-500 bg-slate-900 bg-[repeating-linear-gradient(-45deg,#6366f1,#6366f1_1px,transparent_1px,transparent_4px)]': circle.pattern === 'primary',
                            'bg-slate-900 z-1 border-blue-500 bg-[repeating-linear-gradient(-45deg,theme(colors.blue.500),theme(colors.blue.500)_1px,transparent_1px,transparent_4px)]': circle.pattern === 'blue',
                        })}></div>
                ))}
            </div>
        </div>
        <span className="text-slate-400 mt-2 block text-center text-sm font-medium">{label}</span>
    </div>
)
