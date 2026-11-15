import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { extractOrderIdFromLink, parseChatMessagesFromNotes } from "@/lib/chat-unread";
import { ChatUnreadBadge } from "@/components/ChatUnreadBadge";

describe("Chat Unread Helper Functions", () => {
  it("extracts orderId correctly from various notification link formats", () => {
    const uuid1 = "b598b049-7096-419b-a083-d3fa12ba4d25";
    expect(extractOrderIdFromLink(`/orders?filter=active&chat=${uuid1}`)).toBe(uuid1);
    expect(extractOrderIdFromLink(`/delivery?tab=current&chat=${uuid1}`)).toBe(uuid1);
    expect(extractOrderIdFromLink(`/provider?tab=orders&chat=${uuid1}&foo=bar`)).toBe(uuid1);
    expect(extractOrderIdFromLink(`?chat=${uuid1}`)).toBe(uuid1);
    expect(extractOrderIdFromLink("/orders?filter=active")).toBeNull();
    expect(extractOrderIdFromLink(null)).toBeNull();
    expect(extractOrderIdFromLink(undefined)).toBeNull();
  });

  it("parses chat messages safely from order notes string", () => {
    const rawNotes = "بصل قليل\n<!-- CHAT_V1: [{\"id\":\"1\",\"sender_id\":\"user-1\",\"sender_role\":\"store\",\"message\":\"طلبك جاهز\",\"created_at\":\"2026-11-15T10:00:00Z\"}] -->";
    const messages = parseChatMessagesFromNotes(rawNotes);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe("طلبك جاهز");
    expect(messages[0].sender_role).toBe("store");

    expect(parseChatMessagesFromNotes("ملاحظات عادية فقط")).toEqual([]);
    expect(parseChatMessagesFromNotes(null)).toEqual([]);
    expect(parseChatMessagesFromNotes("<!-- CHAT_V1: invalid-json -->")).toEqual([]);
  });
});

describe("ChatUnreadBadge component", () => {
  it("renders nothing when count is 0 or negative", () => {
    expect(renderToString(<ChatUnreadBadge count={0} />)).toBe("");
    expect(renderToString(<ChatUnreadBadge count={-2} />)).toBe("");
  });

  it("renders badge with exact number when 1 <= count <= 9", () => {
    const html = renderToString(<ChatUnreadBadge count={3} />);
    expect(html).toContain("3");
    expect(html).toContain("bg-destructive");
    expect(html).toContain("3 رسائل غير مقروءة");
  });

  it("renders +9 when count is greater than 9", () => {
    const html = renderToString(<ChatUnreadBadge count={15} />);
    expect(html).toContain("+9");
    expect(html).toContain("bg-destructive");
    expect(html).toContain("15 رسائل غير مقروءة");
  });

  it("renders pulsing red dot when showDotOnly is true", () => {
    const html = renderToString(<ChatUnreadBadge count={2} showDotOnly />);
    expect(html).toContain("animate-ping");
    expect(html).toContain("bg-destructive");
  });
});
