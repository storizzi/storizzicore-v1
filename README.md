# Storizzi Core v1

Storizzi core is a command line / shell interface for organizing your writing work professionally.

It should work from Mac OSX, PC Windows, and Linux as it is based on node.js and Calibre which are available in these ecosystems.

While it is primarily aimed at authors with a more technical background, you don't need development skills to benefit from its approach to authoring - just an inquiring mind and a willingness to take things step-by-step.

What you end up with is a framework for working that can take you from amateur to professional to multi-series author, to multi-author seven-figure income pro with people doing all this for you. Because Storizzi is a system of working that scales with you.

This README gives only basic information on how to install / get going with Storizzi. For more detailed information, tutorials etc. then take a look at the [Storizzi Web Site](https://storizzi.com).

Storizzi core is ideal for authors wishing to approach their writing in a structured yet flexible way that allows you to leverage your work to ensure your writing can be used in a variety of channels without needing to rewrite copy, back matter, or worry about how to organize special editions (eg beta copies or anthologies).

As you progress in your writing career, the admin tasks can become greater and more tedious and feed your procastination demon to the point of stopping writing - I have known several people like this, all because they don't have a simple system so they never need worry about this again.

Storizzi seeks to fill this gap and give a toolset that (from the initial version) gives you the capability to:

* Generate books in common formats such as mobi / epub / docx for Kindle and other e-Readers and PDF for almost every computer device!
* Write using a plain and simple text editor (I recommend Visual Studio code with the all-in-one Markdown plugin) to keep your focus on writing, encouraging the use of tooling like git for maintaining a history of changes
* Structure your documents - eg using a chapter per file or poem per file or an anthology or a series of books
* Keep details of books separated from the main copy - eg author name, copyright details etc
* Organise common copy to share between different works - eg. copyright pages, author bio, advertising (eg keeping your lists of books current for every book)
* Generate special versions by including tags to include special copy - eg. to personalize an edition for beta readers
* Auto-substitute - for example, to include different words or phrases for different markets (eg UK vs US), or to change the name of a character without changing the original manuscript
* Create pipelines to generate books using specific settings time and time again - even generating multiple versions at the same time
* Organise your work into authors / repositories / projects for those organising large bodies of works
* Capture statistics about word usage, and keep track of your timelines to see how many words you have to write per day to meet your deadline
* Include media such as images in your content
* Include standard copy as inclusions so you can use snippets in different places - great if you are generating a standard format over and over again using different copy
* A huge amount more to come...
* And it's [Open Source](LICENSE) too! So adapt it as you see fit, or better still, help contribute to the community...

# Links / Dependencies

Make sure you have the following instlled before you try using Storizzi

* [Calibre App (MacOS/Windows/Linux)](https://calibre-ebook.com/download) - I prefer to use via WSL2 - [Windows subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/install) on Windows machines, but not necessary
  * [Calibre command line eBook converter](
https://manual.calibre-ebook.com/generated/en/ebook-convert.html) - automatically included when installing Calibre - link included for reference purposes
* Node.js - best installed via [package management](https://nodejs.org/en/download/package-manager/)
* Optional: [Kindle previewer](https://www.amazon.com/Kindle-Previewer/b?ie=UTF8&node=21381691011) - Useful tool for PC or Mac to preview your kindle output files before uploading them for Amazon eBook publishing, if you wish to use Storizzi to do this

# Installation

You can clone the repo and work from there, or use npm to install it using:

```npm install -g storizzicore```

To see the command usage, from the shell prompt or command prompt enter:

```storizzi --help```

# Examples

Examples can be found in the ```repos/storizzi/examples``` directory.

To see a list of available example projects, from the root directory of the storizzi installation, type the following command:

```storizzi projlist storizzi```

where the second ```storizzi``` is the name of the user who owns the example projects repository.

For a simple test which generates a book from a markdown version of *The Wizard of Oz*, and generates versions in mobi, epub, pdf and docx formats...

From the root directory of the storizzi installation, type the following command:

```storizzi compile storizzi -r examples```

This is roughly what happens under the hood:

* Looks in the ```users``` directory from the working directory and takes user related settings from the ```storizzi``` directory inside this
* Looks in the ```repos/storizzi``` directory (repos for the storizzi user) and looks inside the ```examples``` directory for the ```examples``` repo
* Looks in the ```settings.json``` file for projects as none have been specified. It finds the default project is ```simple``` and the location for this is the ```simple``` directory, so this is the project directory that will be generated from
* Looks in the ```settings.json``` file of the ```simple``` directory where it finds some simple book metadata such as the book cover image filename, the title and author etc. It works out what it should use for input and output using standard generation template settings, defined in the ```outputDocuments``` section - this shows that all output documents are taken from markdown, and uses ```simple``` generation settings, and each document is given a different output document type
  * The templates are defined in the generic storizzi ```application-settings.json``` - you can override these, or create your own templates as required to replace these
* The ```simple``` generation template defines that the input document to be used will be called ```book.md```
* Inside ```book.md``` is a list of documents that will be included - the ```title.md``` document also includes an image file as part of the page as an example of how to do this
* The ```stylesheet.css``` file is used to make changes to the design of the output document, if required
* A file is generated for each of the items in the ```outputDocuments``` section using for the filename, the prefix ```generated-``` followed by the ```shortTitle``` defined in the project's ```settings.json```, with the filename extension matching the type of file being generated.
* Try out reading these files using an appropriate reader - e.g. Microsoft Word for ```.docx``` or Adobe Reader for ```.pdf``` or Kindle Reader for ```.epub```. Calibre can also be used to open any of these, but won't necessarily give you a sense of the native reading experience.
* Nb. For uploading to Amazon, you are best to use either ```.docx``` or ```.epub``` format - it used to be ```.mobi``` format but this is no longer recommended.

Note, to specify the specific project in the repository, you could have used the following command, which would have done the same thing because the ```simple``` project is the default project in the ```examples``` repo:

```storizzi compile storizzi -r examples -p simple```

# Creating your own structure

I would recommend:

* Create a folder (preferably somewhere you back up from - e.g. a dropbox folder if you use this) where you are going to keep all your work
* Copy the ```repos``` and ```users``` folders into this folder
* Rename ```storizzi``` with your name - e.g. ```simonhuggins``` for the user name in both repos and users folders, and update the ```users/storizzi/settings.json``` file
* Try renaming the ```examples``` folder to ```books``` or something more representative of the type of thing you will be working from in a repository. Update the ```users/storizzi/settings.json``` file to reflect this change
* Try this out by going into your shell / command prompt, and using the 'cd' command to go to the folder you created
* If you type ```ls``` or ```dir``` from here you should see the ```repos``` and ```users``` folders
* Type out: ```storizzi compile simonhuggins -r books```
  * replace ```simonhuggins``` with the name you gave for your user, and ```books``` with whatever name you gave for your repository
* This should generate the wizard of oz books as before, but in your repository. If you are happy this works, you can delete this, if you like (or keep it for reference)
* Try copying the ```emptybook``` folder to another folder at the same level (i.e. within the 'books' repo folder) that represents a new project for a book you want to write and rename it - e.g. to ```mybook```
* Add the new project to the ```settings.json``` file in the repository folder (**not** the one in the new project folder) and set the default project to your project if you like, to avoid having to specify it every time
* Note how the ```copyright.md``` page gets filled in from the values taken from your user and project settings details. This means you never need to change this page, even if the author name or copyright year (for example) change. This gives you a hint as to some of the ways Storizzi can help you to structure how you work so you can reuse content with different details plugged-in.
* Test it works using the ```storizzi compile``` command given earlier (which should work without changing it if you have changed the default project to be the new one)
* Away you go...

Here's the example ```settings.json``` repository file *after* you have added your new ```mybook``` project (assuming you removed the *wizard of oz* example project):

``` javascript
{
  "defaultProjectId" : "mybook",
  
  "projects" : {
    "emptybook" : {
      "name": "Empty Book Example",
      "description": "Empty Book to use as a template to work from",
      "location" : "emptybook"
    },
    "mybook" : {
      "name": "My new novel",
      "description": "My first novel that I will be writing with Storizzi",
      "location" : "mybook"
    }
  }
}
```

# Disclaimer

Use at your own risk! If this isn't fit for purpose or causes you problems, don't blame me! Use something more fit for you needs, or better, ask the community for help, or even better, request a new feature, contribute towards making it better yourself (or pay someone with the skills to adapt it to what you want).

For more information / more formal disclaimer see the [License details](LICENSE)

I have created this to help my own workflow, so it doesn't use the best software architecture principles in the world - I did try creating a better crafted v2 but it was so overengineered it didn't actually work!

So plans are to start from where I was a few years ago, and improve it based on something I know works, rather than making *that* mistake again! Feel free to lend a hand if you have skills in node.js
