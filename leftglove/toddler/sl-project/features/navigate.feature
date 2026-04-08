Feature: Navigate to target app
  The toddler loop UI can navigate a browser to a URL and display
  a screenshot of the result.

  Background:
    Given :test opens the browser to 'http://localhost:8080?api=http://localhost:3333'

  Scenario: Enter URL and navigate
    When :test fills ToddlerLoop.url-input with 'http://localhost:3000/login'
    And :test clicks ToddlerLoop.navigate
    And :test should see ToddlerLoop.status with text 'elements'
    Then :test should see ToddlerLoop.screenshot
