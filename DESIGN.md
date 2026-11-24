# TempMail.Best Design

Choose a 10-minute or 1-hour lifetime, create a temporary inbox, and read mail in a native two-column console window. The newest verification code is pinned for one-click copy, and long messages are presented as paged plain text.

Visual design aligns with the TempMail.Best Nova Mail Console: solid neutral surfaces and 1px borders without gradients or box shadows (`material="solid"`), adapting automatically to the host's native light and dark themes. Restrained mail-accent blue (`#5073ee`) is reserved strictly for brand mark accents, the Disposable Address Capsule copy control, TTL progress (escalating to warning below 30% and destructive below 15%), unread dots, and pinned verification codes. Message list hover and selection stay neutral without blue markers.

The host secret stores the mailbox session as one record. A failed save can be retried. Polling follows panel visibility and stops at expiry. Replacing or deleting an inbox requires confirmation.
