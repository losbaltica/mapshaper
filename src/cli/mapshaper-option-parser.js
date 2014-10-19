/* @requires mapshaper-common */

function CommandParser() {
  var _usage = "",
      _examples = [],
      _commands = [],
      _default = null,
      _note;

  if (this instanceof CommandParser === false) return new CommandParser();

  this.usage = function(str) {
    _usage = str;
    return this;
  };

  this.note = function(str) {
    _note = str;
    return this;
  };

  // set a default command; applies to command line args preceding the first
  // explicit command
  this.default = function(str) {
    _default = str;
  };

  this.example = function(str) {
    _examples.push(str);
  };

  this.command = function(name) {
    var opts = new CommandOptions(name);
    _commands.push(opts);
    return opts;
  };

  this.parseArgv = function(raw) {
    var commandDefs = getCommands(),
        commandRxp = /^--?([\w-]+)$/i,
        commands = [], cmd,
        argv = raw.concat(), // make copy, so we can consume the array
        cmdName, cmdDef, opt;

    while (argv.length > 0) {
      // if there are arguments before the first explicit command, use the default command
      if (commands.length === 0 && moreOptions(argv)) {
        cmdName = _default;
      } else {
        cmdName = readCommandName(argv);
      }
      if (!cmdName) stop("Invalid command:", argv[0]);
      cmdDef = findCommandDefn(cmdName, commandDefs);
      if (!cmdDef) {
        stop("Unknown command:", '-' + cmdName);
      }
      cmd = {
        name: cmdDef.name,
        options: {},
        _: []
      };

      while (moreOptions(argv)) {
        opt = readOption(argv, cmdDef);
        if (!opt) {
          // not a defined option; add it to _ array for later processing
          cmd._.push(argv.shift());
        } else {
          cmd.options[opt[0]] = opt[1];
        }
      }

      if (cmdDef.validate) {
        try {
          cmdDef.validate(cmd);
        } catch(e) {
          stop("[" + cmdName + "] " + e.message);
        }
      }
      commands.push(cmd);
    }
    return commands;

    function moreOptions(argv) {
      return argv.length > 0 && !commandRxp.test(argv[0]);
    }

    function readOption(argv, cmdDef) {
      var token = argv[0],
          optRxp = /^([a-z0-9_+-]+)=(.+)$/i,
          match = optRxp.exec(token),
          name = match ? match[1] : token,
          optDef = findOptionDefn(name, cmdDef),
          optName,
          optVal;

      if (!optDef) return null;

      if (match && (optDef.type == 'flag' || optDef.assign_to)) {
        stop("-" + cmdDef.name + " " + name + " doesn't take a value");
      }

      if (match) {
        argv[0] = match[2];
      } else {
        argv.shift();
      }

      optName = optDef.assign_to || optDef.name.replace(/-/g, '_');
      optVal = readOptionValue(argv, optDef);
      if (optVal === null) {
        stop("Invalid value for -" + cmdDef.name + " " + optName);
      }
      return [optName, optVal];
    }

    function readOptionValue(args, def) {
      var type = def.type,
          raw, val;
      if (type == 'flag') {
        val = true;
      } else if (def.assign_to) { // opt is a member of a set, assigned to another name
        val = def.name;
      } else {
        raw = args[0];
        if (type == 'number') {
          val = Number(raw);
        } else if (type == 'integer') {
          val = Math.round(Number(raw));
        } else if (type == 'comma-sep') {
          val = raw.split(',');
        } else if (type) {
          val = null; // unknown type
        } else {
          val = raw; // string
        }

        if (val !== val || val === null) {
          val = null; // null indicates invalid value
        } else {
          args.shift(); // good value, remove from argv
        }
      }

      return val;
    }

    function readCommandName(args) {
      var match = commandRxp.exec(args[0]);
      if (match) {
        args.shift();
        return match[1];
      }
      return null;
    }

    function findCommandDefn(name, arr) {
      return Utils.find(arr, function(cmd) {
        return cmd.name === name || cmd.alias === name;
      });
    }

    function findOptionDefn(name, cmd) {
      return Utils.find(cmd.options, function(o) {
        return o.name === name || o.alias === name;
      });
    }
  };

  this.getHelpMessage = function(commandNames) {
    var allCommands = getCommands(),
        helpCommands = allCommands,
        helpStr = '',
        cmdPre = ' ',
        optPre = '  ',
        gutter = '  ',
        colWidth = 0,
        detailView = false;

    if (commandNames) {
      detailView = true;
      if (Utils.contains(commandNames, 'all')) {
        helpCommands = allCommands;
      } else {
        helpCommands = allCommands.filter(function(cmd) {
          return Utils.contains(commandNames, cmd.name);
        });
      }

      if (helpCommands.length === 0) {
        detailView = false;
        helpCommands = allCommands;
      }
    }

    if (detailView) {
      helpStr += "\n";
    } else if (_usage) {
      helpStr +=  _usage + "\n\n";
    }

    helpCommands.forEach(function(obj) {
      if (obj.describe) {
        var help = cmdPre + (obj.name ? "-" + obj.name : "");
        if (obj.alias) help += ", -" + obj.alias;
        obj.help = help;
        colWidth = Math.max(colWidth, help.length);
      }
      if (detailView) {
        obj.options.forEach(formatOption);
      }
    });

    helpCommands.forEach(function(obj, i) {
      if (helpCommands == allCommands && obj.title) {
        helpStr += obj.title + "\n";
      }
      if (obj.describe) {
        helpStr += formatHelpLine(obj.help, obj.describe);
      }
      if (obj.title || obj.describe) {

       if (detailView && obj.options.length > 0) {
          obj.options.forEach(addOptionHelp);
          helpStr += '\n';
        }
      }
    });

    if (!detailView && _examples.length > 0) {
      helpStr += "\nExamples\n";
      _examples.forEach(function(str) {
        helpStr += "\n" + str + "\n";
      });
    }

    if (!detailView && _note) {
      helpStr += '\n' + _note;
    }

    return helpStr;

    function formatHelpLine(help, desc) {
      return Utils.rpad(help, colWidth, ' ') + gutter + (desc || '') + '\n';
    }

    function formatOption(o) {
      if (o.describe) {
        o.help = optPre;
        if (o.label) {
          o.help += o.label;
        } else {
          o.help += o.name;
          if (o.alias) o.help += ", " + o.alias;
          if (o.type != 'flag' && !o.assign_to) o.help += "=";
        }
        colWidth = Math.max(colWidth, o.help.length);
      }
    }

    function addOptionHelp(o) {
      if (o.help) {
        helpStr += formatHelpLine(o.help, o.describe);
      }
    }
  };

  this.printHelp = function(commands) {
    console.log(this.getHelpMessage(commands));
  };

  function getCommands() {
    return _commands.map(function(cmd) {
      return cmd.done();
    });
  }
}

function CommandOptions(name) {
  var _command = {
    name: name,
    options: []
  };

  this.validate = function(f) {
    _command.validate = f;
    return this;
  };

  this.describe = function(str) {
    _command.describe = str;
    return this;
  };

  this.alias = function(name) {
    _command.alias = name;
    return this;
  };

  this.title = function(str) {
    _command.title = str;
    return this;
  };

  this.option = function(name, opts) {
    opts = opts || {}; // accept just a name -- some options don't need properties
    if (!Utils.isString(name) || !name) error("Missing option name");
    if (!Utils.isObject(opts)) error("Invalid option definition:", opts);
    opts.name = name;
    _command.options.push(opts);
    return this;
  };

  this.done = function() {
    return _command;
  };
}
