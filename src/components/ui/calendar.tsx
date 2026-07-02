import * as React from "react";
import { DayPicker } from "@daypicker/react";
import { cn } from "@/lib/utils/cn";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, fixedWeeks = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks={fixedWeeks}
      navLayout="around"
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "relative flex flex-col gap-2",
        month_caption: "flex items-center justify-center h-9",
        caption_label: "text-sm font-medium",
        nav: "absolute top-0 left-0 right-0 h-9 flex items-center justify-between pointer-events-none",
        button_previous: "absolute left-0 size-7 flex items-center justify-center rounded-md border border-input bg-card hover:bg-accent transition-colors pointer-events-auto",
        button_next: "absolute right-0 size-7 flex items-center justify-center rounded-md border border-input bg-card hover:bg-accent transition-colors pointer-events-auto",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center",
        week: "flex w-full mt-1",
        day: "relative p-0 text-center text-sm",
        day_button: cn(
          "h-9 w-9 rounded-md text-sm font-normal transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ),
        selected: "[&>button]:bg-brand-500 [&>button]:text-white [&>button]:hover:bg-brand-600",
        today: "[&>button]:font-semibold [&>button]:underline",
        outside: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        disabled: "[&>button]:opacity-30 [&>button]:cursor-not-allowed",
        range_start: "[&>button]:rounded-l-md",
        range_end: "[&>button]:rounded-r-md",
        range_middle: "[&>button]:rounded-none [&>button]:bg-accent",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation } ) =>
          orientation === "left"
            ? <CaretLeftIcon className="size-4" />
            : <CaretRightIcon className="size-4" />,
      }}
      {...props}
    />
  );
}
