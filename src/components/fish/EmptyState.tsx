"use client";

import type { LucideIcon } from "lucide-react";
import { Fish } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Fish, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12 px-6 text-center", className)}>
      <div className="rounded-full bg-muted p-4 text-muted-foreground">
        <Icon className="h-10 w-10" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}
