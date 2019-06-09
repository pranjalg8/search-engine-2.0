$(function() {
  var GSHEET_JSON_URL = 'https://spreadsheets.google.com/feeds/list/1c2aJmDdLkbjW0ErfUB0sfiQ-pt6zdW5KWZgREWs0zvM/1/public/values?alt=json';
  
  var vueSearch = new Vue({
    el: '#vueSearch',
    data: {
      search: '',
      links: [],
      pages: [],
      pageNumber: 1,
      results: [],
      perPage: 10,
      loading: true,
      error: null
    },
    methods: {
      changePage: function(number) {
        location.href = '#vueSearch';
        this.pageNumber = number;
        this.updateResults();
      },
      updateResults: function() {
        var self = this;

        // Clear all previous paging data
        self.pages.splice(0, Infinity);

        // Get an array of search terms as regexes
        var searchTerms = [];
        self.search.replace(
          /([+\-])?(?:"([^"]+)"|(\/((?:[^\/]|\\.)+)\/(i?)|[\S]+))/g,
          function(m, must, quoted, nonQuoted, rgxText, rgxOpts) {
            var realRgxText = rgxText;
            if (rgxText) {
              try {
                new RegExp(rgxText);
              }
              catch (e) {
                rgxText = null;
              }
            }

            rgxText = rgxText || (
              ((quoted ? /^\b/.test(quoted) : !realRgxText) ? '\\b' : '')
              + YourJS.quoteRegExp(quoted || nonQuoted)
              + ((quoted && /\b$/.test(quoted)) ? '\\b' : '')
            );

            searchTerms.push({
              type: realRgxText ? 'regex' : 'string',
              rgx: new RegExp(rgxText, (realRgxText ? rgxOpts : 'i') + 'g'),
              must: must == '+'
                ? true
                : must == '-'
                  ? false
                  : undefined
            });
          }
        );

        // Get the resulting list of links based on the scores.
        var results = self.links
          .reduce(function(scores, link, linkIndex) {
            var score = searchTerms.reduce(function(score, searchTerm) {
              if (score !== false) {
                var matchesTitle = (link.title.match(searchTerm.rgx) || '').length;
                var matchesURL = (link.url.match(searchTerm.rgx) || '').length;
                var matchesDescr = ((link.description || '').match(searchTerm.rgx) || '').length;
                var matchesKeywords = ((link.keywords || '').match(searchTerm.rgx) || '').length;
                var matchesAny = !!(matchesTitle || matchesURL || matchesDescr || matchesKeywords);
                return searchTerm.must !== !matchesAny
                  ? searchTerm.must !== false
                    ? matchesTitle * 8 + matchesURL * 4 + matchesDescr * 2 + matchesKeywords * 1
                    : 1
                  : false;
              }
              return score;
            }, searchTerms.length ? 0 : 1);
            if (score) {
              scores.push({ link: link, score: score, index: linkIndex });
            }
            return scores;
          }, [])
          .sort(function(a, b) { return (b.score - a.score) || (b.index - a.index); })
          .map(function(score) { return score.link; });

        // Setup the paging data
        var pageCount = Math.max(1, Math.ceil(results.length / self.perPage));
        var pageNumber = self.pageNumber = YourJS.clamp(self.pageNumber, 1, pageCount);
        if (pageNumber > 1) {
          self.pages.push(self.getPageObject(1, results));
        }
        if (pageNumber > 2) {
          self.pages.push(self.getPageObject(pageNumber - 1, results));
        }
        self.pages.push(self.getPageObject(pageNumber, results));
        if (pageNumber + 1 < pageCount) {
          self.pages.push(self.getPageObject(pageNumber + 1, results));
        }
        if (pageNumber < pageCount) {
          self.pages.push(self.getPageObject(pageCount, results));
        }

        // Set self.results to only the results that are shown in the current page.
        self.results = results.slice((pageNumber - 1) * self.perPage, pageNumber * self.perPage).map(function(link) {
          link = jQuery.extend({}, link);
          return {
            title: self.markTerms(link.title, searchTerms),
            description: self.markTerms(link.description, searchTerms),
            url: link.url
          };
        });
      },
      markTerms: function(strIn, terms) {
        return terms
          .reduce(function(str, term) {
            return (YourJS.matchAll(strIn, term.rgx) || []).reduce(function(str, termMatch) {
              return str.replace(
                new RegExp('((?:[\\x01\\x02]*[^\\x01\\x02]){' + termMatch.index + '})((?:[\\x01\\x02]*[^\\x01\\x02]){' + (termMatch[0].length) + '})'),
                '$1\x01$2\x02'
              );
            }, str);
          }, strIn)
          .replace(/\x01/g, '<div class="highlight">').replace(/\x02/g, '</div>');
      },
      getPageObject: function(pageNumber, results) {
        return {
          text: pageNumber,
          number: pageNumber,
          caption: Math.min(results.length, 1 + (pageNumber - 1) * this.perPage) + ' to ' + Math.min(results.length, pageNumber * this.perPage)
        };
      }
    },
    watch: {
      search: function(newValue, oldValue) {
        this.pageNumber = 1;
        this.updateResults();
      }
    },
    mounted: function () {
      $.ajax({
        dataType: "json",
        url: GSHEET_JSON_URL + '&cache-buster=' + Math.random(),
        success: function(data) {
          if (data && data.feed && data.feed.entry && data.feed.entry[0]) {
            var missing = ['url', 'title', 'description', 'keywords'].filter(function(name) {
              return !data.feed.entry[0]['gsx$' + name];
            });
            if (missing[0]) {
              vueSearch.error = 'You must add the "`' + missing.join('`", "`').replace(/, (?!.*,)/, ', and ') + '`" field' + (missing[1] ? 's' : '') + '.';
              return;
            }
          }
          else {
            vueSearch.error = 'The specified GSHEET_JSON_URL is invalid:<br>`' + GSHEET_JSON_URL + '`';
            return;
          }

          data.feed.entry.forEach(function(entry) {
            vueSearch.links.push({
              url: entry.gsx$url.$t,
              title: entry.gsx$title.$t,
              description: entry.gsx$description.$t,
              keywords: entry.gsx$keywords.$t
            });
          });
          vueSearch.loading = false;
          vueSearch.updateResults();
        },
        error: function() {
          vueSearch.error = 'The specified GSHEET_JSON_URL does not contain JSON:<br>`' + GSHEET_JSON_URL + '`';
          vueSearch.loading = false;
        }
      });

      // Set focus to search box
      $('#txtQuery').select();
    }
  });
});

/*
 YourJS - Your Very Own JS Library
 http://yourjs.com

 Copyright (c) 2015-2017 Christopher West
 Licensed under the MIT license.
*/
(function(h,c,k){function l(a,b){return function(){return a[b].apply(a,arguments)}}var g=this,m;(function(a,b){m=function(){b||(b=1,g[c]=a);return d}})(g[c]);var n=l([].slice,"call");var d={alias:l,clamp:function(a,b,f){return a<b?b:a>f?f:a},info:function(){return{name:c,version:h,toString:d.toString}},matchAll:function(a,b,f){var c=0,d=[];a.replace(b,function(e){e=n(arguments,0,-1);e.index=e.pop();e.input=a;e.source=b;f&&(e=f(e,++c));e!==k&&d.push(e)});return d.length?d:null},noConflict:m,quoteRegExp:function(a,
b){var c=a.replace(/[[\](){}.+*^$|\\?-]/g,"\\$&");return""===b||b?new RegExp(c,!0===b?"":b):c},slice:n,toString:function(){return"YourJS v"+h+" ("+c+")"}};[].forEach(function(a){a()});"undefined"!==typeof exports?("undefined"!==typeof module&&module.exports&&(exports=module.exports=d),(exports[c]=d)[c]=k):g[c]=d})("2.2.0","YourJS");