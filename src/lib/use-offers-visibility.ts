import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOffersVisibility, toggleOffersVisibility as toggleFn } from "./offers.functions";
import { toast } from "sonner";

const LOCAL_STORAGE_KEY = "al_husayniya_offers_visible";

function getInitialLocalState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

export const offersVisibilityQuery = queryOptions({
  queryKey: ["offers-visibility"],
  queryFn: async () => {
    try {
      const res = await getOffersVisibility();
      const visible = Boolean(res?.visible);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, String(visible));
        } catch {}
      }
      return visible;
    } catch {
      return getInitialLocalState();
    }
  },
  initialData: getInitialLocalState,
  staleTime: 60_000,
});

export function useOffersVisibility() {
  const queryClient = useQueryClient();
  const toggleServer = useServerFn(toggleFn);

  const { data, isLoading } = useQuery(offersVisibilityQuery);

  const mutation = useMutation({
    mutationFn: async (nextVisible: boolean) => {
      // Optimistic client update
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, String(nextVisible));
        } catch {}
      }
      queryClient.setQueryData(["offers-visibility"], nextVisible);
      return await toggleServer({ data: { visible: nextVisible } });
    },
    onSuccess: (result) => {
      const visible = Boolean(result.visible);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, String(visible));
        } catch {}
      }
      queryClient.setQueryData(["offers-visibility"], visible);
      queryClient.invalidateQueries({ queryKey: ["offers-visibility"] });
      if (visible) {
        toast.success("تم إظهار تابة وقسم العروض لجميع المستخدمين والعملاء بنجاح 🎉");
      } else {
        toast.info("تم إخفاء تابة العروض من شريط التنقل والصفحة الرئيسية بنجاح 🔒");
      }
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["offers-visibility"] });
      toast.error(error instanceof Error ? error.message : "فشل تغيير حالة تابة العروض");
    },
  });

  return {
    isVisible: Boolean(data),
    isLoading: isLoading || mutation.isPending,
    toggle: (nextVisible: boolean) => mutation.mutateAsync(nextVisible),
  };
}
