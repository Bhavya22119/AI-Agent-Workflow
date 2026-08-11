import type { JSX } from "react";
import { MousePointerClick, Zap, PlayCircle, Workflow } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      id: "01",
      title: "Design Your Flow",
      description:
        "Use our intuitive drag-and-drop canvas to visually map out your AI agent's logic. No complex coding required.",
      icon: <MousePointerClick className="w-6 h-6 text-zinc-900" />,
      color: "bg-blue-100",
    },
    {
      id: "02",
      title: "Configure Intelligence",
      description:
        "Add LLM nodes, craft custom prompts, and connect external APIs to give your agent the context and capabilities it needs.",
      icon: <Zap className="w-6 h-6 text-zinc-900" />,
      color: "bg-amber-100",
    },
    {
      id: "03",
      title: "Control Execution",
      description:
        "Insert logic gates, conditional branches, and manual approval steps to ensure your agent behaves exactly as intended.",
      icon: <Workflow className="w-6 h-6 text-zinc-900" />,
      color: "bg-emerald-100",
    },
    {
      id: "04",
      title: "Deploy & Automate",
      description:
        "Hit run and watch your agent execute tasks autonomously. Get real-time visual feedback at every step of the workflow.",
      icon: <PlayCircle className="w-6 h-6 text-zinc-900" />,
      color: "bg-purple-100",
    },
  ];

  return (
    <section className="relative w-screen overflow-hidden py-24 bg-zinc-50 border-t border-zinc-200">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 mb-4">
            How AgentFlow Works
          </h2>
          <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
            Build complex, autonomous AI agents in minutes. Our visual builder makes orchestration simple, transparent, and powerful.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div
              key={step.id}
              className="relative group bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
            >
              <div className="absolute top-6 right-6 text-4xl font-bold text-zinc-100 group-hover:text-zinc-200 transition-colors pointer-events-none">
                {step.id}
              </div>
              
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${step.color} shadow-inner`}>
                {step.icon}
              </div>
              
              <h3 className="text-xl font-bold text-zinc-900 mb-3">
                {step.title}
              </h3>
              
              <p className="text-zinc-600 leading-relaxed text-sm">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
      
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/5 blur-[120px]" />
      </div>
    </section>
  );
}
