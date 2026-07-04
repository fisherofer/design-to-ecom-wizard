import { FlaskConical } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Visual marker for features whose backend endpoints are still on the roadmap.
 * Frontend stays wired to mocks so the UX/roadmap is preserved.
 */
export function NotWiredBadge({
  label = "Not Yet Wired",
  detail = "Frontend uses mock data — real backend endpoint is planned but not implemented yet.",
  className,
}: {
  label?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-warning",
              className,
            )}
          >
            <FlaskConical className="h-3 w-3" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {detail}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
