"use client";

import * as React from "react";
import { X, Check, Loader2, Search, User } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchPerson } from "@/server/actions/person";
import { useDebounce } from "@/hooks/use-debounce";

export interface PersonOption {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
}

interface PersonSearchComboboxProps {
  selected: PersonOption[];
  onChange: (selected: PersonOption[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  maxDisplay?: number;
  filterDepartment?: "Acting" | "Directing" | "Writing" | "Production";
}

export function PersonSearchCombobox({
  selected,
  onChange,
  placeholder = "Search people...",
  searchPlaceholder = "Type to search...",
  emptyText = "No people found.",
  className,
  maxDisplay = 2,
  filterDepartment,
}: PersonSearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [results, setResults] = React.useState<PersonOption[]>([]);
  
  const debouncedQuery = useDebounce(query, 300);

  // Fetch results when query changes
  React.useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    searchPerson(debouncedQuery)
      .then((data) => {
        if (cancelled) return;
        
        let filtered = data.map((p) => ({
          id: p.id,
          name: p.name,
          profile_path: p.profile_path,
          known_for_department: p.known_for_department,
        }));

        // Filter by department if specified
        if (filterDepartment) {
          filtered = filtered.filter(
            (p) => p.known_for_department === filterDepartment
          );
        }

        setResults(filtered);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, filterDepartment]);

  const handleSelect = (person: PersonOption) => {
    const isSelected = selected.some((p) => p.id === person.id);
    if (isSelected) {
      onChange(selected.filter((p) => p.id !== person.id));
    } else {
      onChange([...selected, person]);
    }
  };

  const handleRemove = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((p) => p.id !== id));
  };

  // Merge results with already selected items (so they show in the list)
  const displayResults = React.useMemo(() => {
    const resultIds = new Set(results.map((r) => r.id));
    const selectedNotInResults = selected.filter((s) => !resultIds.has(s.id));
    return [...selectedNotInResults, ...results];
  }, [results, selected]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal min-h-9 h-auto", className)}
        >
          <div className="flex flex-wrap gap-1 flex-1 text-left py-0.5">
            {selected.length === 0 ? (
              <span className="text-muted-foreground flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                {placeholder}
              </span>
            ) : selected.length <= maxDisplay ? (
              selected.map((person) => (
                <Badge
                  key={person.id}
                  variant="secondary"
                  className="px-1.5 py-0 text-xs"
                >
                  {person.name}
                  <button
                    onClick={(e) => handleRemove(person.id, e)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-sm">{selected.length} people selected</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : query.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            ) : displayResults.length === 0 ? (
              <CommandEmpty>{emptyText}</CommandEmpty>
            ) : (
              <CommandGroup>
                {displayResults.map((person) => {
                  const isSelected = selected.some((s) => s.id === person.id);
                  return (
                    <CommandItem
                      key={person.id}
                      value={String(person.id)}
                      onSelect={() => handleSelect(person)}
                      className="flex items-center gap-3 py-2"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {person.profile_path ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w45${person.profile_path}`}
                          alt={person.name}
                          width={28}
                          height={42}
                          className="rounded object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-7 h-[42px] bg-muted rounded flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {person.name}
                        </div>
                        {person.known_for_department && (
                          <div className="text-xs text-muted-foreground">
                            {person.known_for_department}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


