"use client";

import { useState } from "react";

export default function ContactForm({ email }: { email: string }) {
  const [opened, setOpened] = useState(false);

  return (
    <form className="contact-form" action={"mailto:" + email} method="post" encType="text/plain" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const subject = encodeURIComponent("MyLinkscan feedback");
      const body = encodeURIComponent(fields.get("message") + "\r\n\r\nReply email: " + fields.get("email"));
      window.location.href = "mailto:" + email + "?subject=" + subject + "&body=" + body;
      setOpened(true);
    }}>
      <label htmlFor="contact-email">Your email</label>
      <input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <label htmlFor="contact-message">Message</label>
      <textarea id="contact-message" name="message" rows={6} required maxLength={1000} />
      <button className="primary" type="submit">Open email draft</button>
      <p className="hint" role="status">{opened ? "If your email app opened, review the draft and send it there." : "Your email app opens a draft for you to review and send."}</p>
    </form>
  );
}
