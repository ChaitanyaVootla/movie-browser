"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Check, Search } from "lucide-react";
import { getNames, getCode, getName } from "country-list";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useUserStore, selectCountryOverride } from "@/stores/user";

// Get all countries from country-list library and sort alphabetically
const ALL_COUNTRY_NAMES = getNames().sort();

// Priority countries to show at the top
const PRIORITY_COUNTRIES = ["India", "United States of America", "United Kingdom", "Canada", "Australia", "Germany", "France", "Japan"];

interface CountrySelectorProps {
  className?: string;
  /** Show compact version (flag only) */
  compact?: boolean;
}

export function CountrySelector({ className, compact = false }: CountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const countryOverride = useUserStore(selectCountryOverride);
  const setCountryOverride = useUserStore((s) => s.setCountryOverride);
  
  // Default to India if no override
  const selectedCode = countryOverride || "IN";
  const selectedCountryName = getName(selectedCode) || "India";

  // Filter and sort countries - priority countries first, then alphabetical
  const filteredCountries = useMemo(() => {
    let countries = ALL_COUNTRY_NAMES;
    
    if (search) {
      const lower = search.toLowerCase();
      countries = countries.filter((name) => {
        const code = getCode(name);
        return name.toLowerCase().includes(lower) || (code && code.toLowerCase().includes(lower));
      });
    }
    
    // Sort: priority countries first, then alphabetical
    return countries.sort((a, b) => {
      const aPriority = PRIORITY_COUNTRIES.indexOf(a);
      const bPriority = PRIORITY_COUNTRIES.indexOf(b);
      
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [search]);

  const handleSelect = (countryName: string) => {
    const code = getCode(countryName);
    if (code) {
      setCountryOverride(code);
    }
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 px-2 h-9 hover:bg-white/10",
            className
          )}
        >
          <Image
            src={`https://flagcdn.com/w40/${selectedCode.toLowerCase()}.png`}
            alt={selectedCountryName}
            width={20}
            height={14}
            className="rounded-[2px] object-cover"
            unoptimized
          />
          {!compact && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {selectedCode}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="end">
        {/* Search input */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search countries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        
        {/* Country list */}
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {filteredCountries.map((countryName) => {
              const code = getCode(countryName);
              if (!code) return null;
              
              return (
                <button
                  key={code}
                  onClick={() => handleSelect(countryName)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm text-sm",
                    "hover:bg-accent transition-colors",
                    selectedCode === code && "bg-accent"
                  )}
                >
                  <Image
                    src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
                    alt={countryName}
                    width={20}
                    height={14}
                    className="rounded-[2px] object-cover flex-shrink-0"
                    unoptimized
                  />
                  <span className="flex-1 text-left truncate">{countryName}</span>
                  {selectedCode === code && (
                    <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  )}
                </button>
              );
            })}
            {filteredCountries.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No countries found
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

