#!/usr/bin/env node

var storizziVersion = "1.0.3"

var program = require('commander')
var jsonfile = require('jsonfile')
var fs = require('fs')
var path = require('path')
var convert = require('ebook-convert')
var marked = require('marked')
var merge = require('deepmerge')
var Handlebars = require('handlebars')
const util = require('util')
var os=require('os')
var dayjs = require('dayjs')
var duration = require('dayjs/plugin/duration')
dayjs.extend(duration)
var relativeTime = require('dayjs/plugin/relativeTime')
dayjs.extend(relativeTime)
var helpers = require('handlebars-helpers')()

var appDir = path.dirname(require.main.filename)
var appDirStr = appDir.replace(/\\/g, '\\\\')
var appSettingsFilename = "application-settings.json"
const { values: valueArray, replace } = require('lodash')
const { exit } = require('process')

Handlebars.registerHelper('date', require('helper-date'))

var initialSettings = {}

marked.setOptions({
  renderer: new marked.Renderer(),
  gfm: false,
  tables: true,
  breaks: false,
  pedantic: false,
  sanitize: true,
  smartLists: true,
  smartypants: true
})

function extractSetting(varNameString, settings) {
  let result=varNameString
  try {
    result = varNameString.split('.').reduce((o,i)=>o[i], settings) // better than eval
    return result
  } catch(err) {
    console.log("Error extracting setting %s: %s",varNameString, err)
    return undefined
  }
  
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));  // Cheaty Clone
}

function extractWords(sentence) {
      let res = sentence
              .replace(/['-]/g,"") //remove things that split within words - apostrophes and hyphens
              .replace(/(\r\n|\n|\r)+/gm," ") //remove newlines
              .replace(/[\^,\/#!$%\^&\*;:{}=@\\\"%_`~\(\)\+\[\]\|<>\?\s]([^\.\^,\/#!$%\^&\*;:{}=@\\\"%_`~\(\)\+\[\]\|<>\?\s]\.)+[\^,\/#!$%\^&\*;:{}=@\\\"%_`~\(\)\+\[\]\|<>\?\s]+/g, function(match, contents, offset, s)
              {
              	 return match.replace(/\./g,"");
              }) // words - let us see if there are any full stops in there and remove them
              .replace(/[\.,\/#!$%\^&\*;:{}=@\\\"%_`~\(\)\+\[\]\|<>\?\s]+/g," ")//1 or more non-alphanumeric to 1 space
              .replace(/(^\s*)|(\s*$)/g,"") //exclude start and end white-space
              .toUpperCase();
      //console.log(res);
      return res.split(" ");
}

function wordCount(sentence) {
  return extractWords(sentence).length;
}

function wordUsage(settings, wordList, phraseSize, topNtoFetch, numToSkip) {
  let occurrences = {};
  for (let wordNo = 0, tot = wordList.length - (phraseSize || 2) + 1; wordNo < tot; wordNo++) {
    let words = "";
    for (let wordNo2 = wordNo, tot2 = wordNo + (phraseSize || 2); wordNo2 < tot2; wordNo2++) {
      words=words+wordList[wordNo2]+" ";
    }
    words = words.trim();
    occurrences[words] = (occurrences[words] || 0)+1;
  }
  let keys = Object.keys(occurrences).sort(function(a,b){return occurrences[b]-occurrences[a]});
   for(let keyNo = numToSkip || 0, tot=keys.length; keyNo < tot && keyNo<(topNtoFetch||100) + (numToSkip || 0); keyNo++) {
     debugMessage(settings, "showWordUsageStats", `${keyNo + 1}: ${keys[keyNo]} (${occurrences[keys[keyNo]]})`);
   }
  //console.dir(occurrences);
  return occurrences;
}

function markDownToHtml(markdownText) {
  return marked(markdownText).replace(/(\r\n|\n|\r)/gm,"");
}

function methodDebug(settings, methodName, start) {
  if ( settings.debug && settings.debug.allowDebugging && (settings.debug.showAllMethodBoundaries ||
    (settings.debug.showSpecificMethodBoundaries && (settings.debug.showSpecificMethodBoundaries.indexOf(methodName.split(" ")[0]) != -1)))) {
    console.log("*** " + (start ? "<<< Start" : ">>> End") + " : " + methodName + " ***");
  }
}

function debugMessage(settings, debugSetting, debugMessage) {
  if ( settings.debug && settings.debug.allowDebugging && settings.debug[debugSetting.split(" ")[0]]) {
    console.log("*** --- " + debugSetting + " : " + debugMessage + " --- ***");
  }
}

function debugDir(settings, debugSetting, objToDir) {
  if ( settings.debug && settings.debug.allowDebugging && settings.debug[debugSetting.split(" ")[0]]) {
    console.log();
    console.log("*** " + "#".repeat(debugSetting.length+8) + " ***");
    console.log("*** ### " + debugSetting + " ### ***");
    console.log("*** " + "#".repeat(debugSetting.length+8) + " ***");
    console.log();
    //console.dir(objToDir);
    console.log(util.inspect(objToDir, {showHidden: false, depth: null}))
    console.log();
    console.log("*** " + "=".repeat(debugSetting.length+8) + " ***");
    console.log();
  }
}


function findAndReplace(settings, valuePairs, template) {
  methodDebug(settings, "findAndReplace", true);
  let resultText = template;
  
  if (typeof valuePairs != "undefined") {
  
    // console.dir(valuePairs);
  
    for (let findValue in valuePairs) {
      let replaceValue = valuePairs[findValue];
      
      debugMessage(settings, "logWhenReplace", "Find "+findValue+" and replace with "+replaceValue);
      let regexpr = new RegExp(findValue, "g");
      resultText = resultText.replace(regexpr, replaceValue);
    }
  }
  methodDebug(settings, "findAndReplace", false);
  return resultText;
}

function compileBookStructure(settings, template, regex) {
  methodDebug(settings, "compileBookStructure", true);
  let regexpr = new RegExp(regex, "g");
  let bookText = template.replace(regexpr, function(match, contents, offset, s)
  {
    if (containsSettings(settings, contents)) return match;
    let replacementText = contents;
    let convertContent = (contents.substring(0,1)==="+"); // convert
    if (convertContent) {
      contents = contents.substring(1);
    }
    let dontTrim = (contents.substring(0,1)==="*"); // don't trim
    if (dontTrim) {
      contents = contents.substring(1);
    }
    
    let includedFileName = settings.basePath+contents;
    debugMessage(settings, "showIncludedFileNames", "Including "+includedFileName+" in book structure");
    if (fs.existsSync(includedFileName)) {
      let fileText = fs.readFileSync(includedFileName, 'utf8') || replacementText;
      if (settings.generateSettings.trimIncludedFiles && !dontTrim) {
        fileText = fileText.trim();
      }
      if (convertContent) {
        fileText = markDownToHtml(fileText);
      }
      return fileText;
    }
    return match; // Keep as-is if the file doesn't exist
  });

  methodDebug(settings, "compileBookStructure", false);  
  return bookText;
}

function containsSettings(settings, template) {
  let internalRegex = settings.inclusionMethods.internalRegex;  
  if(internalRegex && internalRegex.allowInclusion) {
	if(internalRegex.settingsInsertionRegexes) {
	  for (let i = 0; i < internalRegex.settingsInsertionRegexes.length; i++) {
		let regexStr = internalRegex.settingsInsertionRegexes[i];
		if (regexStr) {
		  let regex = new RegExp(regexStr, "g");
          if (regex.test(template)) return true;
		}
	  }
	}
  	if(internalRegex.fileInsertionRegexes) {
	  for (let i = 0; i < internalRegex.fileInsertionRegexes.length; i++) {
		let regexStr = internalRegex.fileInsertionRegexes[i];
		if (regexStr) {
		  let regex = new RegExp(regexStr, "g");
      if (regex.test(template)) return true;
		}
	  }
	}
	if(internalRegex.keyPairInsertionRegexes) {
	  for (let i = 0; i < internalRegex.keyPairInsertionRegexes.length; i++) {
		let regexStr = internalRegex.keyPairInsertionRegexes[i];
		if (regexStr) {
		  let regex = new RegExp(regexStr, "g");
          if (regex.test(template)) return true;
		}
	  }
	  
	}
	
  }  
  return false;
}

function insertSettingsValues(settings, template, regex) {
  methodDebug(settings, "insertSettingsValues", true);
    // console.log("====");
    // console.dir(template);
  let regexpr = new RegExp(regex, "g");
  let bookText = template.replace(regexpr, function(match, contents, offset, s)
  {
    if (containsSettings(settings, contents)) return match;
    let replacementText = extractSetting(contents, settings);
    //let replacementText = eval("settings."+contents);
    // console.log("--- match: %s", match);
    // console.dir(settings);
    // console.log("replacing %s with %s", contents, replacementText);
    debugMessage(settings, "logWhenReplace", "Replacing "+match+" setting with "+replacementText);

    return replacementText || match;
  }
  );
  
  methodDebug(settings, "insertSettingsValues", false);
  return bookText;
}

function insertDynamicValues(settings, template, regex) {
  methodDebug(settings, "insertDynamicValues", true);
  
  let regexpr = new RegExp(regex, "g");
  let bookText = template.replace(regexpr, function(match, contents, offset, s)
  {
    //console.log("Match: %s, contents: %s, containsSettings: %s", match, contents, containsSettings(settings, contents));
    if (containsSettings(settings, contents)) return match;
    let replacementText = match;
    let key = contents.match(/^.+?:/);
    let value = "";
    if (key) {
      key = key[0].slice(0, -1).toUpperCase().trim();
      let keyValue = contents.match(/:.+?$/);
      if (keyValue) {
        value = keyValue[0].slice(1);
      }
    } else
    {
      key = contents;
    }
    
    debugMessage(settings, "keyValueReplacement", "Replacement Key: "+key+", Original Value:"+value);
    
    let keyMatched = false;
    
    if(key==="TOC") {
      keyMatched = true;
      replacementText = "[TOC]\n\n";
      let chapters = "{{br}}" + template.replace(/(\r\n|\n|\r)/gm,"{{br}}")
      chapters = chapters.match(/{{br}}\#.*?{{br}}/g);
      let lastCountHashes = 0;
      for (item of chapters) {
        chapter = item.slice(0,-6).substring(6);
        let thisCountHashes = (chapter.match(/#/g) || []).length;
        if (thisCountHashes == 1 && lastCountHashes > 1) {
          replacementText += "\n";
        }
        replacementText += chapter + "\n";
        lastCountHashes = thisCountHashes;
      }
    }
    
    if(key==="LOWERDASH") {
      keyMatched = true;
      replacementText = value.toLowerCase().replace(/[^a-z0-9]+/g,"-");
    }
    
    if (key=="GETDATE") {
      if (value) {
        let valueArray = value.split(",");
        if (valueArray.length==2) {
          replacementText = dayjs(valueArray[0],valueArray[1]).toISOString();
        } else {
          replacementText = dayjs(value,"YYYY-MM-DD").toISOString();
        }
      }
    }

    if (key=="DAYSUNTIL") {
      if (value) {
        // console.log("DAYSUNTIL:"+value);
        replacementText = dayjs(value).diff(dayjs(),"days");
      }
    }

    if (key=="FILEWORDCOUNT") {
      if (value) {
        let resultData = loadAndProcessFile(settings, value, true, true);
        console.log("Word Count:" + resultData.wordCount);
        if (resultData) {
          replacementText = resultData.wordCount;
        }
      }
    }

    if (key=="SUBTRACT") {
      if (value) {
        let valueArray = value.split(",");
        if (valueArray.length==2) {
          replacementText = valueArray[0]-valueArray[1];
        }
      }
    }

    if (key=="ADD") {
      if (value) {
        let valueArray = value.split(",");
        if (valueArray.length==2) {
          replacementText = valueArray[0]+valueArray[1];
        }
      }
    }
  
    if (key=="DIVIDE") {
      if (value) {
        let valueArray = value.split(",");
        if (valueArray.length==2) {
          replacementText = valueArray[0]/valueArray[1];
        }
      }
    }

    if (key=="MULTIPLY") {
      if (value) {
        let valueArray = value.split(",");
        if (valueArray.length==2) {
          replacementText = valueArray[0]*valueArray[1];
        }
      }
    }

    if (key=="ROUND" && value) {
      replacementText = round(value);
    }

    if(key==="MATCH") {
      replacementText = undefined;
	  if (value) {
		let value1 = value.match(/^.+?=/);
		let value2 = "";
		if (value1) {
		  value1 = value1[0].slice(0, -1).toUpperCase().trim();
		  let value2 = value.match(/=.+?$/);
		  if (value2) {
			value2 = value2[0].slice(1).toUpperCase().trim();
			if(value1===value2) {
			  replacementText = "trueValue";
			}
		  }
		}
      }
      //console.log("XXXX : value=%s, match=%s",value,replacementText);
    }
    
    // This is to get around the issue of nesting one setting inside another
    // Can use [[setting]] as well as {{setting}}
    //if(!keyMatched && (content.substring(0,1)==="$")) {
    //  replacementText = extractSetting(contents, settings);
    //  debugMessage(settings, "logWhenReplace", "Replacing setting: "+contents+" with "+replacementText);
    //}
    
    debugMessage(settings, "keyValueReplacement", "Replacement Value: "+replacementText);
    methodDebug(settings, "insertDynamicValues", false);
    return replacementText;
  }
  );
  
  methodDebug(settings, "insertDynamicValues", false);
  return bookText;
}

Handlebars.registerHelper('toNumber', function(str) {
  return Number(str);
});

Handlebars.registerHelper('fileTextInfo', function(filename) {
  replacementText = {};
  if (filename) {
    
    let resultData = loadAndProcessFile(settings, settings.basePath+path.sep+filename, true, true);
    if (resultData) {
      replacementText = resultData.wordCount;
      resultData.filename = filename;
      resultData.bareFileName = filename.match(/.*\/(.*)\..*/)[1];
      replacementText = resultData;
    }
  }
  return replacementText;
});

Handlebars.registerHelper('daysUntil', function(dateval) {
  return dayjs(dateval).diff(dayjs(),"days");
});

Handlebars.registerHelper('filesTextInfo', function(dirname) {
  resultObj={files:[],totalWords:0};
  if (dirname) {
    // console.log("filesTextInfo dir: "+ settings.basePath+dirname)
    fs.readdirSync( settings.basePath+path.sep+dirname).forEach(filename => {
      fullFileName = settings.basePath+path.sep+dirname + path.sep + filename;
      let resultData = loadAndProcessFile(settings, fullFileName, true, true);
      if (resultData) {
        resultData.filename = fullFileName;
        resultData.bareFileName = fullFileName.match(/.*\/(.*)\..*/)[1];
        resultObj.files.push(resultData);
        resultObj.totalWords+=resultData.wordCount;
      }
    });
  }
  return resultObj;
});

function macroInsertInternal(settings, template) {
  methodDebug(settings, "macroInsertInternal", true);
  let resultText = template;
  if(settings.inclusionMethods) {
    let internalRegex = settings.inclusionMethods.internalRegex;  
    if(internalRegex && internalRegex.allowInclusion) {
    if(internalRegex.settingsInsertionRegexes) {
      for (let i = 0; i < internalRegex.settingsInsertionRegexes.length; i++) {
      let regex = internalRegex.settingsInsertionRegexes[i];
      if (regex) {
        resultText = insertSettingsValues(settings, resultText, regex);
      }
      }
    }
  }
	   
	resultText = findAndReplace(settings, settings.findAndReplace, resultText);
	
	if(internalRegex.fileInsertionRegexes) {
	  for (let i = 0; i < internalRegex.fileInsertionRegexes.length; i++) {
		let regex = internalRegex.fileInsertionRegexes[i];
		if (regex) {
		  resultText = compileBookStructure(settings, resultText, regex);
		}
	  }
	}

	resultText = findAndReplace(settings, settings.findAndReplace, resultText);

	if(internalRegex.keyPairInsertionRegexes) {
	  for (let i = 0; i < internalRegex.keyPairInsertionRegexes.length; i++) {
      let regex = internalRegex.keyPairInsertionRegexes[i];
      if (regex) {
        resultText = insertDynamicValues(settings, resultText, regex);
      }
	  }
	  
	}
	
  }
  methodDebug(settings, "macroInsertInternal", false);
  return resultText;
}

function macroInsertHandlebars(settings, source, lastpass) {
  methodDebug(settings, "macroInsertHandlebars", true)
  let resultText = source
  if (settings.inclusionMethods) {
    let handlebarsMethod = settings.inclusionMethods.handlebars
    if (handlebarsMethod && handlebarsMethod.allowInclusion &&
        (!handlebarsMethod.lastPassOnly || lastpass)
      ) {
      let template = Handlebars.compile(source)
      resultText = template(settings)
    }
  }
  methodDebug(settings, "macroInsertHandlebars", false)
  return resultText
}

function macroInserts(settings, template, lastpass) {
  methodDebug(settings, "macroInserts", true);
  let resultText = template;
  if (template) {
    resultText = findAndReplace(settings, settings.findAndReplace, resultText);
    resultText = macroInsertInternal(settings, resultText);
    resultText = macroInsertHandlebars(settings, resultText, lastpass);
  }
  methodDebug(settings, "macroInserts", false);
  return resultText;
}

function loadAndProcessFile(settings, inputFileName, processFile, doWordCount) {
  methodDebug(settings, "loadAndProcessFile", true);

	if(!fs.existsSync(inputFileName)) {
	  console.log('Input Structure File not found: %s',inputFileName);
	  methodDebug(settings, "loadAndProcessFile", false);
	  return false;
	}
	
	let processedText = fs.readFileSync(inputFileName, 'utf8');
	if (processFile && processedText) {
		processedText = macroInserts(settings, macroInserts(settings, processedText, false), true);
    words = doWordCount ? wordCount(processedText) : 0;
    methodDebug(settings, "loadAndProcessFile", false);
		return {
      resultText: processedText,
      wordCount: words
    };
	}
  methodDebug(settings, "loadAndProcessFile", false);
	return false;	
}

function writeProcessedFile(settings, inputStructureFileName, outputFileName, doWordCount) {
  methodDebug(settings, "writeProcessedFile", true);
	debugMessage(settings, "showProcessedOutputFilename", "Output Processed File: "+outputFileName );

  loadResults = loadAndProcessFile(settings, inputStructureFileName, true, doWordCount);

	if(loadResults && outputFileName) {
		fs.writeFileSync(outputFileName, loadResults.resultText);
        debugMessage(settings, "outputProcessedBookFileNameAndWordCount",'Written compiled file to: '+outputFileName+' ('+loadResults.wordCount+' words)');
        if(doWordCount) {
          wordUsage(settings, extractWords(loadResults.resultText),3);
        }
        methodDebug(settings, "writeProcessedFile", false);
		return true;
	}
    methodDebug(settings, "writeProcessedFile", false);
	return false;	
}

function optionAccumulator() {
  this.optionObject = {};
  this.add = function(optionName, optionValue, quotesCharacter) {
	if(optionValue) {
	  let newOptionValue = optionValue;
	  if (quotesCharacter) {
		newOptionValue = quotesCharacter + optionValue + quotesCharacter;
	  }
	  this.optionObject[optionName] = newOptionValue;
	}
  }
};

function generateBook(settings) {
  methodDebug(settings, "generateBook", true);
  if (settings.generateSettings.processor) {
    if (settings.generateSettings.processor.toUpperCase().trim() === "CALIBRE") {
      generateBookWithCalibre(settings);
    }
    if (settings.generateSettings.processor.toUpperCase().trim() === "NONE") {
      generateNoBook(settings);
    }
  }
  methodDebug(settings, "generateBook", false);
}

function generateNoBook(settings) {
  methodDebug(settings, "generateNoBook", true);
  
  console.log('Generating No Book...');
  

  methodDebug(settings, "generateNoBook", false);
}

function generateBookWithCalibre(settings) {
  methodDebug(settings, "generateBookWithCalibre", true);
  
  console.log('Generating '+settings.generateSettings.outputFormat+'...');

  let releaseDate
  if (settings.releaseMonth && settings.releaseDOM && settings.releaseYear) {
    releaseDate = new Date(settings.releaseMonth.substring(0,3)+" "+settings.releaseDOM+", "+settings.releaseYear).toISOString();
  }

  let options = new optionAccumulator();
  options.add('input',settings.basePath+settings.generateSettings.inputFile,'"');
  options.add('output',settings.basePath+settings.generateSettings.outputFile,'"');
  options.add('authors',settings.author,'"');
  options.add('title',settings.title,'"');
  options.add('comments',settings.description,'"');
  options.add('language',settings.language,'');
  options.add('series',settings.seriesTitle,'"');
  options.add('pageBreaksBefore',settings.generateSettings.pageBreaksBefore,'"');
  options.add('chapter',settings.generateSettings.chapterStartsAt,'"');
  options.add('insertBlankLine',(settings.generateSettings.insertBlankLineSize > 0),'');
  options.add('insertBlankLineSize',settings.generateSettings.insertBlankLineSize,'');
  options.add('lineHeight',settings.generateSettings.lineHeight,'');
  options.add('marginTop',settings.generateSettings.marginTop,'');
  options.add('marginRight',settings.generateSettings.marginRight,'');
  options.add('marginBottom',settings.generateSettings.marginBottom,'');
  options.add('marginLeft',settings.generateSettings.marginLeft,'');
  options.add('formattingType',(settings.generateSettings.sourceFormat==="md") ? "markdown" : "",'');
  options.add('inputEncoding',settings.generateSettings.inputEncoding,'');
  options.add('publisher',settings.publisher,'"');
  options.add('tags',settings.tags,'"');
  options.add('extraCss',settings.basePath+settings.generateSettings.CSSfile,'"');
  options.add('baseFontSize',settings.generateSettings.baseFontSize,'');
  options.add('outputProfile',settings.generateSettings.outputProfile,'"');
  options.add('pubdate',releaseDate,'"');
  options.add('cover',settings.basePath+settings.frontCover,'"');
  options.add('fontSizeMapping',settings.generateSettings.fontSizeMapping,'');
  options.add('changeJustification',settings.generateSettings.justification,'');
  options.add('startReadingAt',settings.generateSettings.startReadingAt,"'");
  options.add('paperSize',settings.generateSettings.paperSize,'');
  options.add('pdfPageNumbers',settings.generateSettings.pageNumbers,'');
  options.add('pdfDefaultFontSize',settings.generateSettings.pdfDefaultFontSize);
  options.add('disableFontRescaling',settings.generateSettings.disableFontRescaling,'');
  if (settings.generateSettings.enableCssTransformRules) {
    options.add('transformCssRules',settings.basePath + path.sep + settings.generateSettings.transformCssRulesFile,'"');
  }
  options.add('smartenPunctuation',settings.generateSettings.smartenPunctuation,'');
  options.add('enableHeuristics',settings.generateSettings.enableHeuristics,'');
  if (settings.debug && settings.debug.createDebugFilesDuringCompile) {
    if (settings.generateSettings.debugPipelinePath) {
      options.add('debugPipeline',settings.basePath + path.sep+settings.generateSettings.debugPipelinePath,'"');
    } else {
      options.add('debugPipeline',settings.basePath + path.sep+settings.generateSettings.outputFormat+path.sep+'generated'+path.sep+'debug','"');
    }
  }
    
  debugDir(settings, "showCalibreSettings", options.optionObject);
  
  convert(options.optionObject, function(err) {
    if (err) console.log(err); else console.log('Generated '+settings.generateSettings.outputFormat+'.');
  });
  
  methodDebug(settings, "generateBookWithCalibre", false);
  
}

// Go through different output documents and associated templates and generate settings to compile document for each
function compileOutputDocuments(settings) {
  methodDebug(settings, "compileOutputDocuments", true);
  
  let outputDocuments = settings.outputDocuments;
  if(outputDocuments) {
	for (let document in outputDocuments) {
    let docSpecificSettings = cloneSettings(settings);
    let docInfo = outputDocuments[document];
	  if (docInfo.generationEnabled) {
	  	debugDir(settings, "showOutputDocumentData for "+document, docInfo);
		if(docInfo.generationTemplates && settings.generationTemplates) {
		  // For each template, 
		  for (let i = 0; i < docInfo.generationTemplates.length; i++) {
			let templateName = docInfo.generationTemplates[i];
			if (templateName) {
			  let templateStructure = cloneSettings(settings.generationTemplates[templateName]);
			  if (templateStructure) {
				docSpecificSettings = mergeSettings(docSpecificSettings, templateStructure, false);
	  	        debugDir(settings, "showOutputDocumentTemplateSettings after including "+templateName, docSpecificSettings.generateSettings);
			  }
			}
		  }
		  docSpecificSettings = parseSettings(docSpecificSettings);
		  if(docInfo.settingsOverrides) {
			docSpecificSettings = mergeSettings(docSpecificSettings, docInfo.settingsOverrides, true);
	  	    debugDir(settings, "showSettingsAfterDocumentSettingsOverride", docSpecificSettings);
		  }
		  // List to output to - each has own version of document specific settings
		  if (docInfo.outputList) {
		    let contactsList = extractSetting(docInfo.outputList, docSpecificSettings);
		    if (contactsList) {
			  // For each person in List...
			  for (let contactId in contactsList) {
	 			  let contactInfo = contactsList[contactId];
			    let personSpecificSettings = cloneSettings(docSpecificSettings);
			    // Can either qualify the customer info with generic 'contactInfo' or use the outputList reference if wish to customize it based on list
			    let contactObjectName = docInfo.useOutputListNameAsReference ? docInfo.outputList : "contactInfo";
			    personSpecificSettings[contactObjectName] = cloneSettings(contactInfo);
			    personSpecificSettings[contactObjectName].contactId = contactId; // because we lose this info otherwise
			    
			    // Include any settings Overrides for the user - either using the pdfBetaBook.settingsOverride (for example) or settingsOverrides
			    let overrideAttribute = extractSetting(docInfo.useDocumentSpecificSettings ? document + ".settingsOverrides" : "settingsOverrides", contactInfo);
			    if (overrideAttribute) {
			      personSpecificSettings = mergeSettings(personSpecificSettings,
			        cloneSettings(overrideAttribute), false);
			    }
			    personSpecificSettings = parseSettings(personSpecificSettings);
			    debugDir(settings, "showSettingsAfterDocPersonSettingsOverride", personSpecificSettings);
				compile(personSpecificSettings, document+" for "+contactId);
			  }
			}
		  } else {
		    compile(docSpecificSettings, document);
		  }
		}
	  }
	}
  }
  methodDebug(settings, "compileOutputDocuments", false);
}

function compile(settings, documentType) {
  methodDebug(settings, "compile", true)
  console.log('Outputting '+documentType+'...')
  debugDir(settings, "showSettingsBeforeCompilation", settings)
  if (settings.generateSettings.generateInputFileFromBookStructureFile) {
	let bookStructureFileName = settings.basePath+settings.generateSettings.bookStructureFile
	debugMessage(settings, "showBookStructureFilename", "Book Structure File: "+bookStructureFileName )
    let outputFileName=settings.basePath+settings.generateSettings.inputFile
    let fileWritten = writeProcessedFile(settings, bookStructureFileName, outputFileName, true)
    if(!fileWritten) {
      methodDebug(settings, "compile", false)
      return
    }
  }
  if (settings.generateSettings.generateCSSFileFromCSSStructureFile) {
	let cssStructureFileName = settings.basePath+settings.generateSettings.CSSstructureFile
    let outputFileName=settings.basePath+settings.generateSettings.CSSfile
    let fileWritten = writeProcessedFile(settings, cssStructureFileName, outputFileName, true)
    if(!fileWritten) {
      methodDebug(settings, "compile", false)
      return
    }
  }
  generateBook(settings)
  methodDebug(settings, "compile", false)
}

function mergeSettings(settings, newSettings, parse) {
  methodDebug(settings, "mergeSettings", true)
  let mergedSettings = merge(settings,newSettings) // only place this should be used!!!
  if (parse) {
    mergedSettings = parseSettings(mergedSettings)
  }
  methodDebug(settings, "mergeSettings", false)
  return mergedSettings
}

function mergeSettingsFile(settings, settingsFilename, parse, mergeServerSettings, settingsFileType) {
   methodDebug(settings, "mergeSettingsFile filename="+settingsFilename, true)
   debugDir(settings, "showSettingsBeforeMergeSettings ("+settingsFilename+")", settings)
   let newSettings = settings
   if (fs.existsSync(settingsFilename)) {
     newSettings = jsonfile.readFileSync(settingsFilename, 'utf8')
     newSettings = mergeSettings(settings, newSettings, parse)
     if (settingsFileType && newSettings.loadedSettings) {
         newSettings.loadedSettings[settingsFileType] = true
     }
     debugMessage(settings, "showWhenMergeSettings", "Merged settings file: "+settingsFilename)
   } else {
     debugMessage(settings, "showIfSettingsFileNotFound", "Settings file not found: "+settingsFilename)
   }
   debugDir(newSettings, "showSettingsAfterMergeSettings ("+settingsFilename+")", settings)
   if(mergeServerSettings) {
	   let serverSettingsFilename = path.dirname(settingsFilename)+settings.sep+"server-"+path.basename(settingsFilename)
	   newSettings = mergeSettingsFile(newSettings, serverSettingsFilename, parse, settingsFileType?(settingsFileType+"-server"):null)
   }
   methodDebug(newSettings, "mergeSettingsFile", false)
   return newSettings
}

function parseSettings(settings) {
  methodDebug(settings, "parseSettings", true)

   let newSettings = settings

   if (settings) {
     newSettings = cloneSettings(settings)

     delete newSettings.findAndReplace // because we do not want to find & replace these!
     let settingsText = JSON.stringify(newSettings)
     // console.log("Before: " + settingsText)
     settingsText = macroInserts(settings, settingsText, false)
     settingsText = macroInserts(settings, settingsText, true)

     newSettings = JSON.parse(settingsText)
     // settings.basePath = basePath
     if (settings.findAndReplace !== undefined) newSettings.findAndReplace = settings.findAndReplace
     // console.log("After: " + JSON.stringify(settings))
   }
   methodDebug(settings, "parseSettings", false)
   return newSettings
}

// Getting Settings from Files

function getUserRepoRootPath(user, globalSettings) {
  return globalSettings.reposRoot + (user?user:globalSettings.userId) + path.sep
}

function getUserRepoPath(user, repoName, globalSettings) {
  return getUserRepoRootPath(user, globalSettings) + repoName + path.sep
}

function getUserDetailsRootPath(user, globalSettings) {
  return globalSettings.usersRoot + path.sep + (user?user:globalSettings.userId) + path.sep
}

function getUserSettingsFileName(user, globalSettings) {
  return getUserDetailsRootPath(user, globalSettings) + "settings.json"
}

function getGlobalSettingsFileName(globalSettings) {
  return getUserSettingsFileName(globalSettings.globalUserId, globalSettings)
}

function getApplicationSettingsFileName() {
  return appDir + path.sep + appSettingsFilename
}

function mergeUserSettingsFile(settings, globalSettings, user, parse, mergeGlobalSettings) {
  methodDebug(settings, "mergeUserSettingsFile", true)
  let userSettingsFileName = getUserSettingsFileName(user, globalSettings)
  if (mergeGlobalSettings) {
    settings = mergeSettings(settings,globalSettings,parse)
  }

  methodDebug(settings, "mergeUserSettingsFile", false)
  return mergeSettingsFile(settings,userSettingsFileName, parse, false,"user")
}

function saveUserSettings(userSettings, globalSettings) {
  methodDebug(userSettings, "saveUserSettings", true)
  if(userSettings && userSettings.user && userSettings.user.alias) {
    fs.writeFileSync(getUserSettingsFileName(userSettings.user.alias, globalSettings), JSON.stringify(userSettings,null,2));
  }
  methodDebug(settings, "saveUserSettings", false)
}

function mergeSystemSettings(settings) {
  let newSettings = {"runTimeStamp" : new Date().toJSON(),
    "debug" : { "allowDebugging" : false },
    "sep" : path.sep.replace(/\\/g, '\\\\'),
    "generateSettings" : {},
    "trueValue" : "match",
    "inclusionMethods" : { },
    "operatingSystem" : os.platform(),
    "operatingSystemType" : os.type(),
    "operatingSystemVersion" : os.release(),
    "storizziVersion" : storizziVersion,
    "appDirectory" : appDirStr,
    "loadedSettings" : { "system" : true } };    
  return mergeSettings(settings,newSettings);
}

function mergeApplicationSettingsFile(settings) {
  methodDebug(settings, "mergeApplicationSettingsFile", true)
  let applicationSettingsFileName = getApplicationSettingsFileName()
  let res = mergeSettingsFile(settings,applicationSettingsFileName, false, false, "application")
  methodDebug(settings, "mergeApplicationSettingsFile", false)
  return res
}

function mergeHomeSettingsFile(settings) {
  methodDebug(settings, "mergeHomeSettingsFile", true)
  let homeSettings = settings
  if (os.homedir()) {
    let homeSettingsFileName = path.join(os.homedir(),".storizzi-settings.json")
    if (!fs.existsSync(homeSettingsFileName)) {
      homeSettingsFileName = path.join(os.homedir(),"storizzi-settings.json")
    }
    if (fs.existsSync(homeSettingsFileName)) {
      homeSettings = mergeSettingsFile(settings,homeSettingsFileName, false, false, "home")
    }
  }
  methodDebug(settings, "mergeHomeSettingsFile", true)
  return homeSettings
}

function mergeCurrentFolderSettingsFile(settings) {
  methodDebug(settings, "mergeCurrentFolderSettingsFile", true)
  let currentFolderSettings = settings
  if (os.homedir()) {
    let currentFolderSettingsFileName = path.join(".","storizzi-settings.json")
    if(fs.existsSync(currentFolderSettingsFileName)) {
      currentFolderSettings = mergeSettingsFile(currentFolderSettings, currentFolderSettingsFileName, false, false, "current-folder")
    }
  }
  methodDebug(settings, "mergeCurrentFolderSettingsFile", true)
  return currentFolderSettings
}

function checkforDefaultUserRepoProj(settings) {
    // Allow for default user Id, repo Id and project ID
    if (!settings.userId && settings.defaultUserId)
      settings.userId = settings.defaultUserId
    if (!settings.userId && settings.user && settings.user.userId)
      settings.userId = settings.user.userId
    if (!settings.repoId && settings.defaultRepoId)
      settings.repoId = settings.defaultRepoId
    if (!settings.projectId && settings.defaultProjectId)
      settings.projectId = settings.defaultProjectId
}

function getAppLevelSettings() {
  // Get system level settings required for basic functioning
  let settings = mergeSystemSettings({})
  settings = mergeApplicationSettingsFile(settings)
  settings = mergeHomeSettingsFile(settings)
  settings = mergeCurrentFolderSettingsFile(settings)
  checkforDefaultUserRepoProj(settings)
  // console.log(util.inspect(settings, {showHidden: false, depth: null}))
  //console.log(util.inspect(settings, {showHidden: false, depth: null}))
  settings = parseSettings(settings) // Only do now to get as much system-level info together as possible
  //console.log(util.inspect(settings, {showHidden: false, depth: null}))
  return settings;
}

function getUserSettings(user, globalSettings, includeGlobalAndMaster) {
  
  // Get user Settings, Repository and base Path of Repository
  checkforDefaultUserRepoProj(globalSettings)
  let userSettings = mergeUserSettingsFile({}, globalSettings, user, true, includeGlobalAndMaster);
  checkforDefaultUserRepoProj(userSettings) // In case now have default repoId

  if (!userSettings.user) {
    console.log("user settings for %s not found", userSettings.userId);
    return null;
  }

  if (!includeGlobalAndMaster) {
    return userSettings;
  }

  settings = mergeSettings({}, globalSettings);
  
  // Get master user settings - but reverse merge order so master settings can be overriden
  if(userSettings.user.masterUser) {
    debugMessage(settings, "showMasterUser", "masterUser: "+userSettings.user.masterUser);
    let masterSettings = mergeUserSettingsFile({}, settings, userSettings.user.masterUser, false, false);
    if (masterSettings) {
      if (masterSettings.user) {
        delete masterSettings.user.password;
        userSettings.masterUserSettings = cloneSettings(masterSettings.user);
        delete masterSettings.user;
      }
      if(masterSettings.masterSettingsWin) {
        userSettings = mergeSettings(userSettings, masterSettings);
      } else {
        userSettings = mergeSettings(masterSettings, userSettings);
      }
    }
  }
    
  settings = mergeSettings(settings, userSettings, true);

  // console.log(util.inspect(settings, {showHidden: false, depth: null}))
  // Ensure system level settings and application settings are not overwritten by user settings
  // Removing this right now as it makes sense for a cloud / server system but not for local use
  // settings = mergeSystemSettings(settings);
  // settings = mergeApplicationSettingsFile(settings);
  // settings = parseSettings(settings);
  
  debugDir(settings, "globalMasterUserSettings", settings)
  
  return settings;
}

function getRepositoryInfoFromUser(globalSettings, user, repository) {

  // get user settings first
  
  let settings = getUserSettings(user, globalSettings, true);
  //console.log(util.inspect(settings, {showHidden: false, depth: null}))
  if (!settings) {
    return null;
  }
  
  // Get default repository if no repository ID was passed
  if(!repository) {
    if (settings.repoId) {
      repository = settings.repoId;
    }
    if (!repository) {
      repository = 'default';
    }
  }

  settings.repositoryId = repository;
  
  if(typeof settings.repositories[repository] === 'undefined') {
    console.log("Repository %s for user %s does not exist", repository, settings.userId);
    return null;
  }
  
  let repositoryRoot = getUserRepoPath(user, repository, settings);

  settings.baseUserRepoPath = repositoryRoot;
  
  return settings;
}

function mergeRepositoryAndUserSettings(globalSettings, user, repository) { 

  // Get both user and repository settings
  let settings = getRepositoryInfoFromUser(globalSettings, user,repository);
  if (!settings) {
   return null;
  }
  
  // get repository settings
  let settingsFilename = settings.baseUserRepoPath + 'settings.json';
  settings = mergeSettingsFile(settings, settingsFilename, true, false, "repo");
  // console.log("Repository Filename: " + settingsFilename);

  return settings;
}

function mergeRepositoryAndUserAndProjectSettings(globalSettings,user,repository,project) { 
  
  let settings = mergeRepositoryAndUserSettings(globalSettings, user, repository)
  
  if (!settings) {
   return null;
  }

  if (!user) {
    user=settings.defaultUserId
   }
  
  // Get project settings
  if (!project) {
    if (settings.defaultProjectId) {
      project = settings.defaultProjectId;
    } else {
      console.log("No default project Id found");
      return null;
    }
  }
  
  settings.projectId = project;
  
  if (!settings.projects[project]) {
      console.log("Project %s for Repository %s User %s not found in project list", project, repository, user );
      return null;
  }

  let projectOffset = settings.projects[project].location;
  
  if (typeof projectOffset === 'undefined') {
    console.log("Location for project %s for Repository %s User %s not found", project, repository, user);
    return null;
  }
  
  if (projectOffset) {
    projectOffset = projectOffset + "/";
  }

  // Set base path to be the project base path (not the user repository base path)
  settings.basePath = settings.baseUserRepoPath+projectOffset;

  if (!settings.allowCompilation) {
    console.log("Repository settings file not found for repository %s, user %s", repository, user);
    return null
  }
  
  // Merge in the main project settings file
  let projectSettingsFilename = settings.basePath + 'settings.json';
  settings = mergeSettingsFile(settings, projectSettingsFilename, true, false, "user");
  // console.log("Repository Project Filename: " + projectSettingsFilename);
  
  // Security: Load again in case tampered with - also overrides masterUser
  settings = mergeUserSettingsFile(settings, settings, user, true, false);

  // Write out the combined settings file
  if (settings.debug && settings.debug.allowDebugging && settings.debug.writeCombinedSettingsFileIntoRepository) {
    let combinedSettingsFilename = settings.basePath + "generated"+path.sep+'combined-settings.json';
    fs.writeFileSync(combinedSettingsFilename, JSON.stringify(settings,null,2));
  }
  
  return settings;
}

//
// MAIN APPLICATION START //
//

showCommandLineHelp = function () {
  console.log(`Storizzi Core - version ${storizziVersion}`)
  console.log('')
  console.log('  Commands:')
  console.log('')
  console.log('    $ storizzi projlist -u <user> - List project / repositories for given user')
  console.log('    $ storizzi compile -u <user> -r <repository> -p <project> - Compile project / repository and generate book')
  console.log('')
}

initialSettings = getAppLevelSettings()

// console.log(util.inspect(initialSettings, {showHidden: false, depth: null}))

if (!process.argv[2]) {
  showCommandLineHelp()
  exit(0)
}

program
 .version( storizziVersion )
 .arguments('<cmd>')
 .on('--help', showCommandLineHelp)
 .action((cmd) => {
   cmdValue = cmd
  })
 .option('-u, --user        [user]', 'User id')
 .option('-r, --repository  [repository]', 'Repository id')
 .option('-p, --project     [project]', 'Project Id within repository')
 .parse(process.argv);

options = program.opts()

if (typeof cmdValue === 'undefined') {
   console.error('No command given')
   process.exit(1)
}

var commandExecuted = false

// console.log("Command: %s, User: %s, Repository: %s", cmdValue, userValue, options.repository);

if (cmdValue==="projlist") {
  
  let settings = getUserSettings(options.user, initialSettings, true)

   // console.log(util.inspect(settings, {showHidden: false, depth: null}))

  if (settings && settings.repositories) {
    for (let key in settings.repositories) {
      let keyValue = settings.repositories[key]
      console.log("- Repo: "+key+" - "+keyValue.name)
      // console.log("- "+"=".repeat(key.length));
      let repoSettings = mergeRepositoryAndUserSettings(settings,options.user, key)
      // console.log(util.inspect(repoSettings, {showHidden: false, depth: null}))
      if(repoSettings && repoSettings.projects) {
        for (let projKey in repoSettings.projects) {
          let projKeyValue = repoSettings.projects[projKey]
          console.log("  - Project:"+projKey+" - "+projKeyValue.name)
          // console.log("  - "+"=".repeat(projKey.length));
          console.log("    - Description: "+projKeyValue.description)
          // console.log(util.inspect(globalSettings, {showHidden: false, depth: null}))
          let projSettings = mergeRepositoryAndUserAndProjectSettings(
            initialSettings,options.user, key, projKey)
          if (projSettings.basePath) console.log("    -    Location: "+projSettings.basePath)
          if (projSettings.shortTitle) console.log("    - Short Title: "+projSettings.shortTitle)
          console.log("  -")
        }
      }
      console.log("-")
    }
    commandExecuted = true
  } else {
    console.log("Cannot find project list.")
    process.exit(1)
  }
}

if (cmdValue==="compile") {
  // console.log(userValue + " " + options.repository + " " + options.project);
  let settings = mergeRepositoryAndUserAndProjectSettings(
    initialSettings,
    options.user, options.repository, options.project)
  if(settings) {
    if (settings.allowCompilation) {
      compileOutputDocuments(settings)
    }
  }
  commandExecuted = true
}

if (!commandExecuted) {
  console.log("Unknown command")
}