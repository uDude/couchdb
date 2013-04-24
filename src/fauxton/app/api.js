// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy of
// the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations under
// the License.

define([
  "app",

  // Modules
  "modules/fauxton/base"
],

function(app, Fauxton) {
  var FauxtonAPI = app.module();

  FauxtonAPI.moduleExtensions = {
    Routes: {
    }
  };

  FauxtonAPI.addonExtensions = {
    initialize: function() {}
  };

  // List of JSHINT errors to ignore
  // Gets around problem of anonymous functions not being a valid statement
  FauxtonAPI.excludedViewErrors = [
    "Missing name in function declaration."
  ];

  FauxtonAPI.isIgnorableError = function(msg) {
    return _.contains(FauxtonAPI.excludedViewErrors, msg);
  };

  FauxtonAPI.View = Backbone.View.extend({
    // This should return an array of promises, an empty array, or null
    establish: function() {
      return null;
    },

    hasRendered: function () {
      return !!this.__manager__.hasRendered;
    },

    reRender: function () {
      this.__manager__.hasRendered = false;
    }
  });

  FauxtonAPI.navigate = function(url) {
    Backbone.history.navigate(url, true);
  };

  FauxtonAPI.addHeaderLink = function(link) {
    app.masterLayout.navBar.addLink(link);
  };

  FauxtonAPI.Deferred = function() {
    return $.Deferred();
  };

  FauxtonAPI.addRoute = function(route) {
    app.router.route(route.route, route.name, route.callback);
  };

  FauxtonAPI.triggerRouteEvent = function (routeEvent, args) {
    app.router.triggerRouteEvent("route:"+routeEvent, args);
  };

  FauxtonAPI.module = function(extra) {
    return app.module(_.extend(FauxtonAPI.moduleExtensions, extra));
  };

  FauxtonAPI.addon = function(extra) {
    return FauxtonAPI.module(FauxtonAPI.addonExtensions, extra);
  };

  FauxtonAPI.addNotification = function(options) {
    options = _.extend({
      msg: "Notification Event Triggered!",
      type: "info",
      selector: "#global-notifications"
    }, options);
    var view = new Fauxton.Notification(options);

    return view.renderNotification();
  };

  FauxtonAPI.UUID = Backbone.Model.extend({
    initialize: function(options) {
      options = _.extend({count: 1}, options);
      this.count = options.count;
    },

    url: function() {
      return app.host + "/_uuids?count=" + this.count;
    },

    next: function() {
      return this.get("uuids").pop();
    }
  });

  // Not needed, could be removed.
  FauxtonAPI.routeCallChain = {
    callChain: {},

    registerBeforeRoute: function (name, fn) {
      this.callChain[name] = fn;
    },

    unregisterBeforeRoute: function (name) {
      delete callChain[name];
    },

    run: function () {
      var callChainDeferreds = _.map(this.callChain, function (cb) { return cb(); }); 
      return $.when(null, callChainDeferreds );
    }
  };


  FauxtonAPI.RouteObject = function(options) {
    this._options = options;

    this._configure(options || {});
    this.initialize.apply(this, arguments);
    this.addEvents();
  };

  // Piggy-back on Backbone's self-propagating extend function
  FauxtonAPI.RouteObject.extend = Backbone.Model.extend;

  var routeObjectOptions = ["views", "routes", "events", "data", "crumbs", "layout", "apiUrl", "establish"];

  _.extend(FauxtonAPI.RouteObject.prototype, Backbone.Events, {
    // Should these be default vals or empty funcs?
    views: {},
    routes: {},
    events: {},
    data: {},
    crumbs: [],
    layout: "with_sidebar",
    apiUrl: null,
    renderedState: false,
    currTab: "databases",
    establish: function() {},
    route: function() {},
    initialize: function() {}
  }, {

    // TODO:: combine this and the renderWith function
    // All the things should go through establish, as it will resolve
    // immediately if its already done, but this way the RouteObject.route
    // function can rebuild the deferred as needed
    render: function(route, masterLayout, args) {
      this.route.call(this, route, args);
      this.renderWith.apply(this, Array.prototype.slice.call(arguments));
    },

    renderWith: function(route, masterLayout, args) {
      var routeObject = this;

      // Only want to redo the template if its a full render
      if (!this.renderedState) {
        masterLayout.setTemplate(this.layout);
      }

      masterLayout.clearBreadcrumbs();
      var crumbs = this.get('crumbs');

      if (crumbs.length) {
        masterLayout.setBreadcrumbs(new Fauxton.Breadcrumbs({
          crumbs: crumbs
        }));
      }

      $.when.apply(this, this.establish()).done(function(resp) {
        _.each(routeObject.getViews(), function(view, selector) {
          if(view.hasRendered()) { console.log('view been rendered'); return; }

          masterLayout.setView(selector, view);
          console.log('set and render ', selector, view); 

          $.when.apply(null, view.establish()).then(function(resp) {
            masterLayout.renderView(selector);
          }, function(resp) {
            view.establishError = {
              error: true,
              reason: resp
            };
            masterLayout.renderView(selector);
          });

          var hooks = masterLayout.hooks[selector];

          _.each(hooks, function(hook){
            if (_.any(hook.routes, function(route){return route == boundRoute;})){
              hook.callback(view);
            }
          });
        });
      });

      if (this.get('apiUrl')) masterLayout.apiBar.update(this.get('apiUrl'));

      // Track that we've done a full initial render
      this.renderedState = true;
    },

    get: function(key) {
      return _.isFunction(this[key]) ? this[key]() : this[key];
    },

    addEvents: function(events) {
      events = events || this.get('events');
      _.each(events, function(method, event) {
        if (!_.isFunction(method) && !_.isFunction(this[method])) {
          throw new Error("Invalid method: "+method);
        }
        method = _.isFunction(method) ? method : this[method];

        this.on(event, method);
      }, this);
    },

    _configure: function(options) {
      _.each(_.intersection(_.keys(options), routeObjectOptions), function(key) {
        this[key] = options[key];
      }, this);
    },

    getView: function(selector) {
      return this.views[selector];
    },

    setView: function(selector, view) {
      this.views[selector] = view;
      return view;
    },

    getViews: function() {
      return this.views;
    }

  });

  app.fauxtonAPI = FauxtonAPI;
  return app.fauxtonAPI;
});