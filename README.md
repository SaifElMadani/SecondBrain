# My Space - Personal Dashboard

Welcome to your personal dashboard! This guide is written for you to understand how the project works, how your data is saved, how you can access it on your phone, and how to make quick edits directly in the code.

---

## 1. How HTML, CSS, and JS Work Together

Think of your website as a house:
*   **HTML (`index.html`) is the skeleton & walls**: It defines the structure. It tells the browser "here is a header," "here is a sidebar button," "here is a text box," and "here is a calendar." Without HTML, there is nothing.
*   **CSS (`style.css`) is the interior design & layout**: It styles the house. It sets the colors (the dark theme), the spacing, the fonts, and makes the layout responsive. For example, it tells the browser to hide the sidebar and show a hamburger menu (☰) when the screen is as small as a mobile phone.
*   **JavaScript (`app.js`) is the electricity & appliances**: It makes the house functional. When you click a button to add a task, it is JavaScript that reads your input, adds it to the list, updates the screen, and saves it.

---

## 2. How Your Changes Get Saved

Your data (tasks, objectives, interests, calendar events) is saved using **LocalStorage**.
*   **What is LocalStorage?** It is a small database built directly into your web browser. 
*   **How does it work?** Every time you add, complete, or remove something, JavaScript runs `save()` which writes your updated data into your browser's local memory. When you refresh or reopen the page, it runs `load()` to read that data back.
*   *Note: Because this data is stored in your specific browser on your specific computer, if you open the site in a different browser (e.g., switching from Chrome to Edge) or clear your browser's cache, the data will be reset to the default values.*

---

## 3. How to Make Changes Faster Directly in Code

Instead of clicking buttons in the app one-by-one, you can preload your interests, objectives, and tasks directly in the code!

Open [`app.js`](file:///c:/Users/saife/Desktop/WebsiteProject/app.js) and look at the `load()` function (around lines 19 to 35). You will see the default arrays:

```javascript
return {
  objectives: [
    { id: uid(), title: 'Run a half marathon', note: 'Build up weekly mileage by 10%.', progress: 30 },
    { id: uid(), title: 'Read 12 books this year', note: 'Fiction and non-fiction.', progress: 50 },
  ],
  fields: [
    { id: uid(), name: 'Photography', note: 'Shooting with a 35mm lens more often.' },
    // Add your own items here!
  ],
  todos: [
    { id: uid(), text: 'Review morning pages', priority: 'low', done: false, date: dk() },
  ],
  events: {}
};
```

### Steps to bulk edit:
1. Modify these items in the code.
2. In your browser, open the developer tools (press `F12` or right-click -> Inspect), go to the **Console** tab, type `localStorage.clear()`, and press Enter.
3. Refresh the page, and your new preloaded list will appear!

---

## 4. How to Sync and Access on Your Phone

Because **LocalStorage** is local to each browser, if you open the site on your phone, it will start with a blank database and will *not* sync automatically with your computer. 

Here are the ways to solve this:

### Option A: Manual Export/Import (Zero-cost & Private)
We can easily add an **"Export / Import Data"** button in the app.
*   **Export**: Generates a code snippet representing your data. You can copy it and send it to your phone (via email, WhatsApp, etc.).
*   **Import**: Paste the code on your phone's app to load all your settings instantly.

### Option B: Cloud Database (Automatic Sync)
To make your desktop and phone sync automatically in real-time, we can hook up your project to a free database like **Google Firebase** or **Supabase**.
*   This is free for personal use.
*   We can configure a private login screen so that only *you* can access your database.

---

## 5. How to Publish Your Site Online (Free & Private)

To access your app from your phone anywhere in the world, you must publish it to the internet. Here are two free and secure methods:

### Method 1: Netlify Drop (Easiest)
1. Go to [Netlify Drop](https://app.netlify.com/drop).
2. Drag and drop your `WebsiteProject` folder into the upload box.
3. Your site is instantly live on a secret link (e.g., `https://random-words-12345.netlify.app`). 
4. *To make it private*: Although anyone with the link can theoretically see it, the link is obscure and impossible to guess. If you want absolute security, we can add a **password protection page** directly in the HTML/JS that requires entering a PIN before showing the dashboard.

### Method 2: GitHub Pages (For Code Version Control)
1. Create a free private repository on [GitHub](https://github.com).
2. Upload your files.
3. Enable GitHub Pages to deploy your site.
