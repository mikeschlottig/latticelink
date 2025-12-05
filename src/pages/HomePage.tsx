import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Link as LinkIcon, Tag, FileType, X, Loader2, Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDebounce } from 'react-use';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast } from '@/components/ui/sonner';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
interface LinkResult {
  id: string;
  url: string;
  title: string;
  description: string;
  tags: string[];
  score: number | null;
  metadata: {
    mime: string;
    byteSize: number;
    lastModified: string;
  };
}
const MimeTypeOptions = [
  { value: 'text/html', label: 'HTML' },
  { value: 'application/pdf', label: 'PDF' },
  { value: 'image/*', label: 'Image' },
  { value: 'video/*', label: 'Video' },
];
export function HomePage() {
  const { isDark, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [mimeType, setMimeType] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<LinkResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuggestLoading, setIsSuggestLoading] = useState(false);
  useDebounce(() => setDebouncedQuery(query), 300, [query]);
  const fetchSuggestions = useCallback(async (partial: string) => {
    if (partial.length < 2) {
      setSuggestions([]);
      return;
    }
    setIsSuggestLoading(true);
    try {
      const data = await api<string[]>(`/api/suggest?partial=${partial}`);
      setSuggestions(data);
    } catch (error) {
      // Silently fail for suggestions
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsSuggestLoading(false);
    }
  }, []);
  useEffect(() => {
    const lastQueryPart = query.split(/\s+/).pop() || '';
    fetchSuggestions(lastQueryPart);
  }, [query, fetchSuggestions]);
  const search = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.append('q', debouncedQuery);
      if (selectedTags.size > 0) params.append('tags', Array.from(selectedTags).join(','));
      if (mimeType) params.append('mime', mimeType);
      const data = await api<LinkResult[]>(`/api/search?${params.toString()}`);
      setResults(data);
    } catch (error: any) {
      toast.error('Search failed', { description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, selectedTags, mimeType]);
  useEffect(() => {
    search();
  }, [search]);
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  };
  const availableSuggestions = useMemo(() => {
    return suggestions.filter(s => !selectedTags.has(s));
  }, [suggestions, selectedTags]);
  const ResultCard = ({ result }: { result: LinkResult }) => (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="h-full flex flex-col bg-card/50 backdrop-blur-sm border-border/50 shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300">
        <CardHeader>
          <CardTitle className="text-lg font-semibold line-clamp-2">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {result.title}
            </a>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow">
          <p className="text-muted-foreground text-sm line-clamp-3">{result.description}</p>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-3">
          <div className="flex flex-wrap gap-2">
            {result.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => toggleTag(tag)}>
                {tag}
              </Badge>
            ))}
          </div>
          <div className="text-xs text-muted-foreground/80 flex items-center gap-4 w-full">
            <div className="flex items-center gap-1"><FileType size={12} /> {result.metadata.mime}</div>
            {result.score && <div className="flex items-center gap-1">Score: {result.score.toFixed(2)}</div>}
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
  const SkeletonCard = () => (
    <Card className="bg-card/50">
      <CardHeader>
        <Skeleton className="h-6 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </CardFooter>
    </Card>
  );
  return (
    <div className="min-h-screen bg-background text-foreground font-sans relative">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:16px_16px]"></div>
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-background via-background/80 to-transparent -z-10"></div>
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#F38020] to-[#E55A1B] flex items-center justify-center">
                <LinkIcon className="text-white h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold font-display">LatticeLink</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-24 md:py-28 lg:py-32">
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold font-display tracking-tight">
              Find Your Links, <span className="text-gradient">Instantly</span>.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              An intelligent, self-hosted search engine for your personal library of links. Powered by Cloudflare Workers, AI, and Vectorize.
            </p>
          </div>
          <div className="mt-12 max-w-3xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
              <Input
                placeholder='Search by keyword, or "use quotes for exact match"...'
                className="pl-12 pr-4 py-6 text-base"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <AnimatePresence>
              {availableSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-2 bg-card/80 backdrop-blur-sm border rounded-md shadow-lg p-2 flex flex-wrap gap-2"
                >
                  {availableSuggestions.map(s => (
                    <Badge key={s} variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => toggleTag(s)}>
                      + {s}
                    </Badge>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <div className="flex-grow flex items-center gap-2 flex-wrap">
                <Tag className="text-muted-foreground h-4 w-4" />
                {selectedTags.size === 0 ? (
                  <span className="text-sm text-muted-foreground">No tags selected</span>
                ) : (
                  Array.from(selectedTags).map(tag => (
                    <Badge key={tag} variant="default" className="bg-primary/80">
                      {tag}
                      <button onClick={() => toggleTag(tag)} className="ml-1.5 rounded-full hover:bg-background/20 p-0.5">
                        <X size={12} />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <Select value={mimeType} onValueChange={setMimeType}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Types</SelectItem>
                  {MimeTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-16">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {results.map(r => <ResultCard key={r.id} result={r} />)}
                </AnimatePresence>
              </div>
            ) : (
              <div className="text-center py-16 border-2 border-dashed rounded-lg">
                <h3 className="text-xl font-semibold">No results found</h3>
                <p className="text-muted-foreground mt-2">Try adjusting your search query or filters.</p>
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className="border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-muted-foreground">
          Built with ❤️ at Cloudflare
        </div>
      </footer>
      <Toaster richColors closeButton />
    </div>
  );
}