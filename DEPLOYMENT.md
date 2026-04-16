# ImRa Research Assistant - Deployment Guide

## Quick Deployment to Vercel

### Prerequisites
1. GitHub Account (free) - https://github.com/signup
2. Vercel Account (free) - https://vercel.com (sign up with GitHub)

### Step-by-Step Instructions

#### **1. Initialize Git Locally**
```bash
cd f:\AG\research-assistant
git init
git add .
git commit -m "Initial commit - Research Assistant App"
```

#### **2. Create GitHub Repository**
1. Go to https://github.com/new
2. Create a repository named `research-assistant`
3. **Do NOT** initialize with README, .gitignore, or license (we already have these)
4. Copy the commands it shows and run them:

```bash
# Example (your URL will be different):
git remote add origin https://github.com/YOUR_USERNAME/research-assistant.git
git branch -M main
git push -u origin main
```

When prompted, enter your GitHub username and password/token.

#### **3. Deploy to Vercel**
1. Go to https://vercel.com
2. Click "Add New" → "Project"
3. Select your `research-assistant` repository
4. Click "Deploy"
5. Wait 2-3 minutes for deployment

**Your app will be live at:** `https://your-project.vercel.app`

#### **4. Set Environment Variables in Vercel**
1. In Vercel dashboard, go to your project
2. Click "Settings" → "Environment Variables"
3. Add these variables:
   - `FIREBASE_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `GOOGLE_API_KEY`
   - (And others from `.env` file)
4. Redeploy after adding variables

---

## Files Prepared for Deployment

✅ `vercel.json` - Vercel configuration
✅ `.env` - Environment variables (keep this private!)
✅ `.env.example` - Template for environment variables
✅ `.gitignore` - Files to ignore in Git

---

## Security Notes

⚠️ Your API keys are in `.env` which is in `.gitignore` - they WON'T be pushed to GitHub.
⚠️ Add your API keys to Vercel's environment variables for the production app to work.

---

## Need Help?

- GitHub Guide: https://docs.github.com/en/get-started
- Vercel Docs: https://vercel.com/docs
