/** Incremental parser: fetch chunks do not align with event boundaries. */
export class SSEParser {
  private buffer = "";
  push(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > 2 * 1024 * 1024)
      throw new Error("Stream frame too large");
    const events: { event: string; data: unknown }[] = [];
    let boundary: number;
    while ((boundary = this.buffer.indexOf("\n\n")) >= 0) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length)
        events.push({ event, data: JSON.parse(data.join("\n")) });
    }
    return events;
  }
}
