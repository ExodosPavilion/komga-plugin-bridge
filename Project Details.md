# Komga Plugins

I want to add plugin support to Komga. In an ideal world the plugin system gets added on top of komga with no changes to the komga source code.

## Feasibility Check
- So lets check if it is at all possible to add plugin support to komga without altering the source code. If it is possible what are the drawbacks of doing so verses making changes to the source code. 
- If it is not possible to add the plugin support to komga without touching the source code is there a way to make an installer of sorts that adds in the plugin support? That way there is no need to maintain a fork of komga just to make it plugin compatible. If the installer is a possiblility what are the drawbacks of doing that as compared to the other options?
- Worst case scenario (and one I would like to avoid) is we have to make major changes to the komga source code to even have any shot at adding the plugin support. In that case the project needs to be built with the idea that every update that we bring over to our fork needs to be reworked with our changes hence any changes that add in plugin support need to support changes to the system in the future is some way. How we achieve that, I don't know.

Some examples of plugins that I might want to add in:
- Supporting a different metadata system that is not ComicInfo.xml, might be a fully custom schema.
- Native intergration with something like (https://github.com/Snd-R/komf)
- Custom series.json system that is not mylar
- Option to hide the series from some libraries appearing in the home screen
- better handling of duplicate pages (e.g. undo adding things to be ignored)
- smarter handling of duplicate pages

---

**This project is not affiliated with the Komga project and at no point do I want to ever make a pull request to the official komga repo.**