Feature: Sieve target page
  Clicking the Sieve button captures the current page's element
  inventory and displays a screenshot with SVG overlay.

  Background:
    Given :test opens the browser to 'http://localhost:8080?api=http://localhost:3333'
    And :test clears ToddlerLoop.url-input
    And :test fills ToddlerLoop.url-input with 'http://localhost:3000/login'
    And :test clicks ToddlerLoop.navigate
    And pause for 5 seconds
    And :test should see ToddlerLoop.status with text 'elements'

  Scenario: Sieve populates element inventory
    Then :test should see ToddlerLoop.screenshot
    And :test should see ToddlerLoop.overlay
    And :test should see ToddlerLoop.progress

  Scenario: Re-sieve refreshes inventory
    When :test clicks ToddlerLoop.sieve
    And :test should see ToddlerLoop.status with text 'elements'
    Then :test should see ToddlerLoop.screenshot
