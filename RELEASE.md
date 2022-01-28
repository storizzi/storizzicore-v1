# RELEASE HISTORY

## v1.0.3 - 

- Tested with PC installation - interim on dev branch
  - installing using ``npm install "https://github.com/storizzi/storizzicore-v1.git#dev" --global``
- Bug fix on PC path for Application Root and path separator as used in config

## v1.0.2 - 21 Jan 2022

- User is no longer a required parameter, but uses the -u parameter
- User, Repository and Project are optional parameters and can be driven from default settings values
- Default settings file from home directory - .storizzi-settings.json or storizzi-settings.json
- Default settings file from current directory (loaded AFTER the home directory settings file)
- Added loadedSettings object within settings to show which types of settings have been loaded
- Bug Fix: Running storizzi with no parameters now shows help if there is no default settings available
- Bug Fix: A few null checks were missing - now fixed
- Some refactoring of names to keep things consistent, replacement of var variables with let variables
- Repositories details no longer part of User object - this made no sense, just because it is defined in the user settings file
- Updated README with correct npm install name, correct typos
- Added keywords to package.json

## v1.0.1 - 2 Jan 2022

- Remove 'private' for NPM upload and add content to RELEASE file

## v1.0.0 - 27 Dec 2021

- Initial release
